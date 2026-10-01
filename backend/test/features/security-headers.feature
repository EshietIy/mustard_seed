Feature: Security headers
  The JSON API sends a locked-down set of security headers on every response.

  Background:
    Given the API is running

  Scenario Outline: Security headers are present on <path>
    When I GET "<path>"
    Then the response header "strict-transport-security" contains "max-age=31536000"
    And the response header "strict-transport-security" contains "includeSubDomains"
    And the response header "x-content-type-options" is "nosniff"
    And the response header "content-security-policy" is "default-src 'none';frame-ancestors 'none'"
    And the response header "referrer-policy" is "strict-origin-when-cross-origin"
    And the response header "cross-origin-resource-policy" is "same-site"
    And the response header "x-frame-options" is "DENY"
    And the response header "x-powered-by" is absent

    Examples:
      | path                  |
      | /health               |
      | /api/v1/config/public |
      | /api/v1/does-not-exist |

  Scenario: API responses are never cached
    When I GET "/api/v1/config/public"
    Then the response header "cache-control" is "no-store"

  Scenario: Error responses are never cached either
    When I GET "/api/v1/does-not-exist"
    Then the response header "cache-control" is "no-store"
