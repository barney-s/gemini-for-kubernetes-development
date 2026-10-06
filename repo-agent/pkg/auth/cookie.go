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
	"net/http"
	"os"
	"strconv"
	"strings"

	"github.com/gin-contrib/sessions"
)

const (
	// DefaultSessionCookieMaxAge is 30 days (in seconds).
	DefaultSessionCookieMaxAge = 86400 * 30
)

// CookieSecureConfig reports whether session cookies should have the Secure flag
// enabled based on the SESSION_COOKIE_SECURE / COOKIE_SECURE environment variables,
// or nil if neither is explicitly configured (allowing dynamic detection or fallback).
func CookieSecureConfig() *bool {
	for _, envKey := range []string{"SESSION_COOKIE_SECURE", "COOKIE_SECURE"} {
		if val, set := os.LookupEnv(envKey); set {
			val = strings.TrimSpace(val)
			if b, err := strconv.ParseBool(val); err == nil {
				return &b
			}
		}
	}
	return nil
}

// IsRequestHTTPS returns true if the incoming request was served over HTTPS,
// taking into account TLS connection state and standard reverse proxy headers.
func IsRequestHTTPS(req *http.Request) bool {
	if req == nil {
		return false
	}
	if req.TLS != nil {
		return true
	}
	proto := req.Header.Get("X-Forwarded-Proto")
	return strings.EqualFold(proto, "https")
}

// SessionCookieOptions returns the configured sessions.Options for the session cookie.
// If explicitly configured via SESSION_COOKIE_SECURE / COOKIE_SECURE, that value is used.
// If unconfigured (nil), secure defaults to false so that login over plain HTTP is supported,
// while DynamicSessionOptions adjusts the Secure flag per-request dynamically.
func SessionCookieOptions(secure *bool) sessions.Options {
	isSecure := false
	sameSite := http.SameSiteLaxMode
	if secure != nil {
		isSecure = *secure
	}
	if isSecure {
		sameSite = http.SameSiteNoneMode
	}
	return sessions.Options{
		Path:     "/",
		MaxAge:   DefaultSessionCookieMaxAge,
		Secure:   isSecure,
		HttpOnly: true,
		SameSite: sameSite,
	}
}

// SessionOptionsForRequest returns the sessions.Options appropriate for a given request.
// If explicitly configured via SESSION_COOKIE_SECURE / COOKIE_SECURE, that configuration
// is strictly honored. Otherwise, Secure is dynamically set to true if the request is HTTPS,
// and false if HTTP.
func SessionOptionsForRequest(req *http.Request) sessions.Options {
	if configured := CookieSecureConfig(); configured != nil {
		return SessionCookieOptions(configured)
	}
	isHTTPS := IsRequestHTTPS(req)
	return SessionCookieOptions(&isHTTPS)
}
