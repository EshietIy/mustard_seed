Feature: Error handling and structured logging
  Every request is logged with a correlation ID; errors never leak internals.

  Background:
    Given the API is running

  Scenario: A successful request is logged at info with the transaction fields
    When I GET "/api/v1/config/public"
    Then the response status is 200
    And an "info" log entry has:
      | req.method | GET                   |
      | req.url    | /api/v1/config/public |
      | statusCode | 200                   |
      | outcome    | SUCCESS               |
    And that log entry has a "responseTime" number
    And that log entry's "req.id" equals the response header "x-request-id"

  Scenario: A supplied correlation ID is echoed and logged
    When I GET "/api/v1/config/public" with headers:
      | X-Request-Id | 3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b |
    Then the response header "x-request-id" is "3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b"
    And an "info" log entry has:
      | req.id | 3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b |

  Scenario: A malformed correlation ID is replaced
    When I GET "/api/v1/config/public" with headers:
      | X-Request-Id | <script>alert(1)</script> |
    Then the response header "x-request-id" is a UUID

  Scenario: An unexpected error returns a generic 500 with no stack trace
    When I GET "/api/v1/__test/boom"
    Then the response status is 500
    And the response JSON at "error.code" is "INTERNAL_ERROR"
    And the response JSON at "error.message" is "Something went wrong on our side. Please try again."
    And the response JSON at "error.requestId" equals the response header "x-request-id"
    And the response body does not contain "kaboom"
    And the response body does not contain "stack"
    And an "error" log entry has:
      | errorCode | INTERNAL_ERROR |
      | outcome   | FAILED         |

  Scenario: Invalid input returns 400 with field-level errors
    When I POST "/api/v1/__test/echo" with JSON:
      """
      { "name": "", "extra": "not allowed" }
      """
    Then the response status is 400
    And the response JSON at "error.code" is "VALIDATION_FAILED"
    And the response JSON at "error.details" includes a field error for "name"
    And the response JSON at "error.details" includes a field error for "extra"
    And a "warn" log entry has:
      | errorCode | VALIDATION_FAILED |
      | outcome   | FAILED            |

  Scenario: Malformed JSON returns 400 without leaking parser details
    When I POST "/api/v1/__test/echo" with raw body "{not json" and content type "application/json"
    Then the response status is 400
    And the response JSON at "error.code" is "BAD_REQUEST"
    And the response body does not contain "Unexpected"

  Scenario: Secrets in headers are redacted from logs
    When I GET "/api/v1/config/public" with headers:
      | Authorization | Bearer super-secret-token-123 |
      | Cookie        | session=cookie-secret-456     |
    Then the response status is 200
    And no log entry contains "super-secret-token-123"
    And no log entry contains "cookie-secret-456"
