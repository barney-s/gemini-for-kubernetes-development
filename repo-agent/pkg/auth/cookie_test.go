// Copyright 2026 The Kubernetes Authors.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

package auth

import (
	"crypto/tls"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-contrib/sessions"
	"github.com/gin-contrib/sessions/cookie"
	"github.com/gin-gonic/gin"
)

func TestCookieSecureConfig(t *testing.T) {
	tests := []struct {
		name     string
		envKey   string
		envVal   string
		expected *bool
	}{
		{
			name:     "unset",
			expected: nil,
		},
		{
			name:     "SESSION_COOKIE_SECURE=true",
			envKey:   "SESSION_COOKIE_SECURE",
			envVal:   "true",
			expected: boolPtr(true),
		},
		{
			name:     "SESSION_COOKIE_SECURE=false",
			envKey:   "SESSION_COOKIE_SECURE",
			envVal:   "false",
			expected: boolPtr(false),
		},
		{
			name:     "COOKIE_SECURE=1",
			envKey:   "COOKIE_SECURE",
			envVal:   "1",
			expected: boolPtr(true),
		},
		{
			name:     "COOKIE_SECURE=0",
			envKey:   "COOKIE_SECURE",
			envVal:   "0",
			expected: boolPtr(false),
		},
		{
			name:     "COOKIE_SECURE=invalid",
			envKey:   "COOKIE_SECURE",
			envVal:   "invalid",
			expected: nil,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Setenv("SESSION_COOKIE_SECURE", "")
			t.Setenv("COOKIE_SECURE", "")
			// Unset explicitly in case t.Setenv set it to empty string
			if tc.envKey != "" {
				t.Setenv(tc.envKey, tc.envVal)
			}
			got := CookieSecureConfig()
			if tc.expected == nil {
				if got != nil {
					t.Fatalf("expected nil, got %v", *got)
				}
			} else {
				if got == nil {
					t.Fatalf("expected %v, got nil", *tc.expected)
				}
				if *got != *tc.expected {
					t.Fatalf("expected %v, got %v", *tc.expected, *got)
				}
			}
		})
	}
}

func TestIsRequestHTTPS(t *testing.T) {
	tests := []struct {
		name     string
		req      *http.Request
		expected bool
	}{
		{
			name:     "nil request",
			req:      nil,
			expected: false,
		},
		{
			name:     "plain HTTP",
			req:      httptest.NewRequest(http.MethodGet, "http://example.com/test", nil),
			expected: false,
		},
		{
			name: "TLS connection",
			req: func() *http.Request {
				r := httptest.NewRequest(http.MethodGet, "http://example.com/test", nil)
				r.TLS = &tls.ConnectionState{}
				return r
			}(),
			expected: true,
		},
		{
			name: "X-Forwarded-Proto https",
			req: func() *http.Request {
				r := httptest.NewRequest(http.MethodGet, "http://example.com/test", nil)
				r.Header.Set("X-Forwarded-Proto", "https")
				return r
			}(),
			expected: true,
		},
		{
			name: "X-Forwarded-Proto HTTPS (uppercase)",
			req: func() *http.Request {
				r := httptest.NewRequest(http.MethodGet, "http://example.com/test", nil)
				r.Header.Set("X-Forwarded-Proto", "HTTPS")
				return r
			}(),
			expected: true,
		},
		{
			name: "X-Forwarded-Proto http",
			req: func() *http.Request {
				r := httptest.NewRequest(http.MethodGet, "http://example.com/test", nil)
				r.Header.Set("X-Forwarded-Proto", "http")
				return r
			}(),
			expected: false,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := IsRequestHTTPS(tc.req)
			if got != tc.expected {
				t.Fatalf("expected %v, got %v", tc.expected, got)
			}
		})
	}
}

func TestSessionOptionsForRequest(t *testing.T) {
	t.Run("auto-detect HTTP request", func(t *testing.T) {
		t.Setenv("SESSION_COOKIE_SECURE", "")
		t.Setenv("COOKIE_SECURE", "")
		req := httptest.NewRequest(http.MethodGet, "http://example.com/", nil)
		opts := SessionOptionsForRequest(req)
		if opts.Secure {
			t.Errorf("expected Secure=false for plain HTTP, got true")
		}
		if opts.SameSite != http.SameSiteLaxMode {
			t.Errorf("expected SameSite=Lax for HTTP, got %v", opts.SameSite)
		}
		if !opts.HttpOnly {
			t.Errorf("expected HttpOnly=true")
		}
		if opts.Path != "/" {
			t.Errorf("expected Path=/, got %q", opts.Path)
		}
	})

	t.Run("auto-detect HTTPS request", func(t *testing.T) {
		t.Setenv("SESSION_COOKIE_SECURE", "")
		t.Setenv("COOKIE_SECURE", "")
		req := httptest.NewRequest(http.MethodGet, "http://example.com/", nil)
		req.Header.Set("X-Forwarded-Proto", "https")
		opts := SessionOptionsForRequest(req)
		if !opts.Secure {
			t.Errorf("expected Secure=true for HTTPS, got false")
		}
		if opts.SameSite != http.SameSiteNoneMode {
			t.Errorf("expected SameSite=None for HTTPS, got %v", opts.SameSite)
		}
	})

	t.Run("override with SESSION_COOKIE_SECURE=false over HTTPS", func(t *testing.T) {
		t.Setenv("SESSION_COOKIE_SECURE", "false")
		req := httptest.NewRequest(http.MethodGet, "http://example.com/", nil)
		req.Header.Set("X-Forwarded-Proto", "https")
		opts := SessionOptionsForRequest(req)
		if opts.Secure {
			t.Errorf("expected Secure=false when overridden by env var, got true")
		}
		if opts.SameSite != http.SameSiteLaxMode {
			t.Errorf("expected SameSite=Lax when Secure=false, got %v", opts.SameSite)
		}
	})

	t.Run("override with SESSION_COOKIE_SECURE=true over HTTP", func(t *testing.T) {
		t.Setenv("SESSION_COOKIE_SECURE", "true")
		req := httptest.NewRequest(http.MethodGet, "http://example.com/", nil)
		opts := SessionOptionsForRequest(req)
		if !opts.Secure {
			t.Errorf("expected Secure=true when overridden by env var, got false")
		}
		if opts.SameSite != http.SameSiteNoneMode {
			t.Errorf("expected SameSite=None when Secure=true, got %v", opts.SameSite)
		}
	})
}

func TestSessionCookieInGinHandler(t *testing.T) {
	gin.SetMode(gin.TestMode)

	t.Run("session cookie created over HTTP has Secure=false", func(t *testing.T) {
		t.Setenv("SESSION_COOKIE_SECURE", "")
		t.Setenv("COOKIE_SECURE", "")

		r := gin.New()
		store := cookie.NewStore([]byte("secret-key-32-bytes-long-1234567"))
		store.Options(SessionCookieOptions(CookieSecureConfig()))
		r.Use(sessions.Sessions("test-session", store))

		r.GET("/login", func(c *gin.Context) {
			session := sessions.Default(c)
			session.Options(SessionOptionsForRequest(c.Request))
			session.Set(UserKey, "testuser")
			if err := session.Save(); err != nil {
				c.String(http.StatusInternalServerError, "error: %v", err)
				return
			}
			c.String(http.StatusOK, "ok")
		})

		req := httptest.NewRequest(http.MethodGet, "http://example.com/login", nil)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("status code = %d, body: %s", w.Code, w.Body.String())
		}

		cookies := w.Result().Cookies()
		var sessionCookie *http.Cookie
		for _, c := range cookies {
			if c.Name == "test-session" {
				sessionCookie = c
				break
			}
		}

		if sessionCookie == nil {
			t.Fatalf("expected test-session cookie to be set, cookies: %+v", cookies)
		}

		if sessionCookie.Secure {
			t.Errorf("expected cookie Secure=false for HTTP request, got Secure=true")
		}
		if sessionCookie.SameSite != http.SameSiteLaxMode {
			t.Errorf("expected cookie SameSite=Lax for HTTP request, got %v", sessionCookie.SameSite)
		}
	})

	t.Run("session cookie created over HTTPS has Secure=true", func(t *testing.T) {
		t.Setenv("SESSION_COOKIE_SECURE", "")
		t.Setenv("COOKIE_SECURE", "")

		r := gin.New()
		store := cookie.NewStore([]byte("secret-key-32-bytes-long-1234567"))
		store.Options(SessionCookieOptions(CookieSecureConfig()))
		r.Use(sessions.Sessions("test-session", store))

		r.GET("/login", func(c *gin.Context) {
			session := sessions.Default(c)
			session.Options(SessionOptionsForRequest(c.Request))
			session.Set(UserKey, "testuser")
			if err := session.Save(); err != nil {
				c.String(http.StatusInternalServerError, "error: %v", err)
				return
			}
			c.String(http.StatusOK, "ok")
		})

		req := httptest.NewRequest(http.MethodGet, "http://example.com/login", nil)
		req.Header.Set("X-Forwarded-Proto", "https")
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("status code = %d, body: %s", w.Code, w.Body.String())
		}

		cookies := w.Result().Cookies()
		var sessionCookie *http.Cookie
		for _, c := range cookies {
			if c.Name == "test-session" {
				sessionCookie = c
				break
			}
		}

		if sessionCookie == nil {
			t.Fatalf("expected test-session cookie to be set, cookies: %+v", cookies)
		}

		if !sessionCookie.Secure {
			t.Errorf("expected cookie Secure=true for HTTPS request, got Secure=false")
		}
		if sessionCookie.SameSite != http.SameSiteNoneMode {
			t.Errorf("expected cookie SameSite=None for HTTPS request, got %v", sessionCookie.SameSite)
		}
	})
}

func boolPtr(b bool) *bool {
	return &b
}
