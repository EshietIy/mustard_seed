Feature: Rate limiting
  Clients that send too many requests get 429 with Retry-After.

  Scenario: Exceeding the global limit returns 429
    Given the API is running with:
      | THROTTLE_LIMIT  | 3     |
      | THROTTLE_TTL_MS | 60000 |
    When I GET "/api/v1/config/public" 3 times
    Then the response status is 200
    When I GET "/api/v1/config/public"
    Then the response status is 429
    And the response header "retry-after" is a positive integer
    And the response JSON at "error.code" is "RATE_LIMITED"
    And a "warn" log entry has:
      | statusCode | 429    |
      | outcome    | FAILED |

  Scenario: Routes marked strict use the stricter limit
    Given the API is running with:
      | THROTTLE_LIMIT        | 100 |
      | THROTTLE_STRICT_LIMIT | 2   |
    When I POST "/api/v1/__test/strict" 2 times
    Then the response status is 201
    When I POST "/api/v1/__test/strict"
    Then the response status is 429
    And the response header "retry-after" is a positive integer
