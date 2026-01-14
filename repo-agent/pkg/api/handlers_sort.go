package api

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/gke-labs/gemini-for-kubernetes-development/repo-agent/pkg/auth"
	"github.com/gke-labs/gemini-for-kubernetes-development/repo-agent/pkg/k8s"
	"k8s.io/klog/v2"
	v1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

const defaultSortPrompt = `
You are a technical lead. Rank the following Pull Requests by priority and urgency.
Consider the title, and the agent draft summary if available.
Prioritize bug fixes, urgent features, and small blocking changes.
Deprioritize drafts or large refactors unless critical.

Return the list of PR IDs in order of priority (highest first).
Return ONLY the list of IDs as a JSON array of strings/numbers.
Example: ["123", "125", "124"]
`

func (s *Server) sortPRs(c *gin.Context) {
	log := klog.FromContext(c.Request.Context())
	namespace := c.MustGet(auth.UserKey).(string)
	repo := c.Param("repo")

	// 1. Get PRs from Store (Active PRs)
	prs, err := s.Store.ListPRs(c.Request.Context(), namespace, repo)
	if err != nil {
		log.Info("Error listing PRs for sorting", "err", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to list PRs"})
		return
	}

	if len(prs) == 0 {
		c.JSON(http.StatusOK, []string{})
		return
	}

	// 2. Prepare context for LLM
	var prDescriptions []string
	for _, pr := range prs {
		desc := fmt.Sprintf("ID: %s\nTitle: %s", pr.ID, pr.Title)
		if pr.AgentDraft != "" {
			// Extract a summary if possible, or use the draft.
			// Truncate to avoid huge context
			draft := pr.AgentDraft
			if len(draft) > 500 {
				draft = draft[:500] + "..."
			}
			desc += fmt.Sprintf("\nSummary: %s", draft)
		}
		prDescriptions = append(prDescriptions, desc)
	}

	prContext := strings.Join(prDescriptions, "\n---\n")

	// 3. Get Sort Prompt
	prompt := defaultSortPrompt

	// Check User Secret
	if sec, err := s.K8sManager.Clientset.CoreV1().Secrets(namespace).Get(c.Request.Context(), k8s.GeminiSecretName, v1.GetOptions{}); err == nil {
		if val, ok := sec.Data[k8s.SortPromptKey]; ok && len(val) > 0 {
			prompt = string(val)
		}
	}

	// Check Repo Annotation (RepoWatch)
	rw, err := s.K8sManager.GetRepoWatch(c.Request.Context(), namespace, repo)
	if err == nil {
		annotations := rw.GetAnnotations()
		if val, ok := annotations["review.gemini.google.com/sort-prompt"]; ok && val != "" {
			// Repo prompt overrides default, but User prompt overrides Repo (User preference)
			// Wait, usually User preference should win.
			// Logic: Default -> Repo -> User.
			// I already checked User. If User set it, we use it.
			// If User didn't set it (prompt == defaultSortPrompt), check Repo.
			// BUT, how do I know if User set it vs it just being default?
			// I need a flag or check.
			
			// Let's re-read:
			userPromptSet := false
			if sec, err := s.K8sManager.Clientset.CoreV1().Secrets(namespace).Get(c.Request.Context(), k8s.GeminiSecretName, v1.GetOptions{}); err == nil {
				if val, ok := sec.Data[k8s.SortPromptKey]; ok && len(val) > 0 {
					prompt = string(val)
					userPromptSet = true
				}
			}

			if !userPromptSet {
				prompt = val
			}
		}
	}

	// 4. Construct Full Prompt
	fullPrompt := fmt.Sprintf("%s\n\nPull Requests:\n%s\n\nOutput:", prompt, prContext)

	// 5. Call Gemini API
	// Need API Key
	apiKey := ""
	if sec, err := s.K8sManager.Clientset.CoreV1().Secrets(namespace).Get(c.Request.Context(), k8s.GeminiSecretName, v1.GetOptions{}); err == nil {
		if val, ok := sec.Data["gemini"]; ok && len(val) > 0 {
			apiKey = string(val)
		}
	}

	if apiKey == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Gemini API Key not found in settings"})
		return
	}

	sortedIDs, err := callGeminiForSorting(apiKey, fullPrompt)
	if err != nil {
		log.Info("Failed to sort PRs via LLM", "err", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "AI Sorting failed", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, sortedIDs)
}

type GeminiContent struct {
	Parts []GeminiPart `json:"parts"`
	Role  string       `json:"role,omitempty"`
}

type GeminiPart struct {
	Text string `json:"text"`
}

type GeminiRequest struct {
	Contents []GeminiContent `json:"contents"`
}

type GeminiResponse struct {
	Candidates []struct {
		Content GeminiContent `json:"content"`
	} `json:"candidates"`
}

func callGeminiForSorting(apiKey, prompt string) ([]string, error) {
	url := "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=" + apiKey

	reqBody := GeminiRequest{
		Contents: []GeminiContent{
			{
				Parts: []GeminiPart{{Text: prompt}},
			},
		},
	}

	jsonBody, err := json.Marshal(reqBody)
	if err != nil {
		return nil, err
	}

	resp, err := http.Post(url, "application/json", bytes.NewBuffer(jsonBody))
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("gemini api error: %s - %s", resp.Status, string(body))
	}

	var geminiResp GeminiResponse
	if err := json.NewDecoder(resp.Body).Decode(&geminiResp); err != nil {
		return nil, err
	}

	if len(geminiResp.Candidates) == 0 || len(geminiResp.Candidates[0].Content.Parts) == 0 {
		return nil, fmt.Errorf("no content in gemini response")
	}

	text := geminiResp.Candidates[0].Content.Parts[0].Text
	
	// Clean up text (strip ```json ... ```)
	text = strings.TrimSpace(text)
	text = strings.TrimPrefix(text, "```json")
	text = strings.TrimPrefix(text, "```")
	text = strings.TrimSuffix(text, "```")
	text = strings.TrimSpace(text)

	// Try to parse as JSON array
	var ids []interface{} // Use interface to handle numbers or strings
	if err := json.Unmarshal([]byte(text), &ids); err != nil {
		// Fallback: try to find lines that look like IDs
		return nil, fmt.Errorf("failed to parse json response: %s", text)
	}

	var strIDs []string
	for _, id := range ids {
		strIDs = append(strIDs, fmt.Sprintf("%v", id))
	}

	return strIDs, nil
}
