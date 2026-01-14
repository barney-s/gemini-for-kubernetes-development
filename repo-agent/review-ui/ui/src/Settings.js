import React, { useState, useEffect } from 'react';

function Settings({ onBack }) {
    const [githubPat, setGithubPat] = useState('');
    const [geminiKey, setGeminiKey] = useState('');
    const [sortPrompt, setSortPrompt] = useState('');
    const [status, setStatus] = useState({ github_pat_set: false, gemini_api_key_set: false, sort_prompt_set: false });
    const [isLoading, setIsLoading] = useState(true);
    const [message, setMessage] = useState({ text: '', type: '' }); // type: 'success' or 'error'

    useEffect(() => {
        fetch('/api/settings')
            .then(res => res.json())
            .then(data => {
                setStatus(data);
                setIsLoading(false);
            })
            .catch(err => {
                console.error("Failed to fetch settings status:", err);
                setIsLoading(false);
            });
    }, []);

    const handleSave = (e) => {
        e.preventDefault();
        setMessage({ text: 'Saving...', type: 'info' });

        const payload = {};
        if (githubPat) payload.github_pat = githubPat;
        if (geminiKey) payload.gemini_api_key = geminiKey;
        if (sortPrompt !== '') payload.sort_prompt = sortPrompt; // Only send if user typed something. Empty string to clear is handled by separate button or if user explicitly clears it? 
        // Actually, if user wants to clear, they might delete text and save. 
        // But here I'm using placeholder behavior for "set". 
        // If I want to allow clearing by saving empty string, I need to know if user intended to change it.
        // Let's assume if it's empty, we don't send it unless we have a specific "Clear" action, 
        // OR we can just allow overwriting.
        // For simplicity, let's treat non-empty input as update. 
        // Clearing is better handled by a clear button for "password" like fields, but Sort Prompt is text.
        // Let's allow updating with text. To clear, we can add a Clear button.
        
        if (sortPrompt) payload.sort_prompt = sortPrompt;

        if (Object.keys(payload).length === 0) {
             setMessage({ text: 'Nothing to update.', type: 'info' });
             return;
        }

        fetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        })
        .then(res => {
            if (res.ok) {
                setMessage({ text: 'Settings updated successfully!', type: 'success' });
                setGithubPat('');
                setGeminiKey('');
                setSortPrompt('');
                // Refresh status
                fetch('/api/settings').then(r => r.json()).then(setStatus);
            } else {
                throw new Error('Failed to update settings');
            }
        })
        .catch(err => {
            console.error(err);
            setMessage({ text: 'Error updating settings.', type: 'error' });
        });
    };

    const handleClearPat = () => {
        if (!window.confirm("Are you sure you want to clear your manual PAT?")) return;
        
        fetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ github_pat: "" })
        })
        .then(res => {
            if (res.ok) {
                setMessage({ text: 'Manual PAT cleared.', type: 'success' });
                fetch('/api/settings').then(r => r.json()).then(setStatus);
            } else {
                throw new Error('Failed to clear PAT');
            }
        })
        .catch(err => setMessage({ text: 'Error clearing PAT.', type: 'error' }));
    };

    const handleClearSortPrompt = () => {
        if (!window.confirm("Are you sure you want to clear your custom Sort Prompt?")) return;

        fetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sort_prompt: "" })
        })
        .then(res => {
            if (res.ok) {
                setMessage({ text: 'Sort Prompt cleared.', type: 'success' });
                fetch('/api/settings').then(r => r.json()).then(setStatus);
            } else {
                throw new Error('Failed to clear Sort Prompt');
            }
        })
        .catch(err => setMessage({ text: 'Error clearing Sort Prompt.', type: 'error' }));
    };

    if (isLoading) return <div className="settings-container"><p>Loading settings...</p></div>;

    return (
        <div className="settings-container">
            <h2>User Settings</h2>
            <p>Configure your personal access tokens. These are stored securely in your private namespace.</p>
            
            {message.text && <div className={`message ${message.type}`}>{message.text}</div>}

            <form onSubmit={handleSave} className="settings-form">
                <div className="form-group">
                    <label htmlFor="githubPat">GitHub Personal Access Token (PAT):</label>
                    <div className="status-info">
                        {status.manual_pat_set ? (
                            <span className="status-badge set">✅ Manual PAT Configured</span>
                        ) : status.oauth_pat_set ? (
                            <span className="status-badge oauth">ℹ️ Using OAuth Login Token</span>
                        ) : status.github_pat_set ? (
                             <span className="status-badge set">✅ Legacy PAT Configured</span>
                        ) : (
                            <span className="status-badge missing">⚠️ No Token Configured</span>
                        )}
                    </div>
                    <div className="input-status-wrapper">
                        <input
                            type="password"
                            id="githubPat"
                            value={githubPat}
                            onChange={(e) => setGithubPat(e.target.value)}
                            placeholder={status.manual_pat_set ? "Enter new PAT to overwrite" : "Enter new Manual PAT"}
                        />
                        {status.manual_pat_set && (
                            <button type="button" className="btn btn-delete btn-sm" onClick={handleClearPat} style={{marginLeft: '10px'}}>Clear Manual PAT</button>
                        )}
                    </div>
                    <small>
                        Manual PAT takes precedence over OAuth login. 
                        You can generate a <a href="https://github.com/settings/tokens" target="_blank" rel="noopener noreferrer">GitHub Classic PAT</a> with 'repo' (read/write) permissions.
                        {status.oauth_pat_set && !status.manual_pat_set && " You are currently using your GitHub login session."}
                    </small>
                </div>

                <div className="form-group">
                    <label htmlFor="geminiKey">Gemini API Key:</label>
                    <div className="input-status-wrapper">
                        <input
                            type="password"
                            id="geminiKey"
                            value={geminiKey}
                            onChange={(e) => setGeminiKey(e.target.value)}
                            placeholder={status.gemini_api_key_set ? "(Currently set - leave blank to keep)" : "Enter new API Key"}
                        />
                         <span className={`status-badge ${status.gemini_api_key_set ? 'set' : 'missing'}`}>
                            {status.gemini_api_key_set ? '✅ Configured' : '⚠️ Not Set'}
                        </span>
                    </div>
                    <small>Required for AI-powered reviews and triage.</small>
                </div>

                <div className="form-group">
                    <label htmlFor="sortPrompt">Custom Sort Prompt (AI):</label>
                    <div className="input-status-wrapper">
                         <textarea
                            id="sortPrompt"
                            value={sortPrompt}
                            onChange={(e) => setSortPrompt(e.target.value)}
                            placeholder={status.sort_prompt_set ? "(Currently set - leave blank to keep)" : "Enter custom prompt for sorting PRs (e.g., 'Prioritize security fixes...')"}
                            rows="4"
                            style={{width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc'}}
                        />
                         <span className={`status-badge ${status.sort_prompt_set ? 'set' : 'missing'}`} style={{alignSelf: 'flex-start', marginTop: '10px'}}>
                            {status.sort_prompt_set ? '✅ Configured' : 'Using Default'}
                        </span>
                         {status.sort_prompt_set && (
                            <button type="button" className="btn btn-delete btn-sm" onClick={handleClearSortPrompt} style={{marginLeft: '10px', alignSelf: 'flex-start', marginTop: '10px'}}>Clear</button>
                        )}
                    </div>
                    <small>Customize how the AI ranks Pull Requests.</small>
                </div>

                <div className="form-actions">
                    <button type="submit" className="btn btn-submit">Save Settings</button>
                    <button type="button" className="btn" onClick={onBack}>Back to Dashboard</button>
                </div>
            </form>
        </div>
    );
}

export default Settings;