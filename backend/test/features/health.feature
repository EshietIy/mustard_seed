Feature: Health check
  Uptime monitors call an unversioned health endpoint.

  Background:
    Given the API is running

  Scenario: Health endpoint reports ok
    When I GET "/health"
    Then the response status is 200
    And the response JSON is:
      """
      { "status": "ok" }
      """
    And the response header "x-request-id" is a UUID

  Scenario: Health endpoint is not under the versioned prefix
    When I GET "/api/v1/health"
    Then the response status is 404

  Scenario: Health endpoint is never rate limited
    Given the API is running with:
      | THROTTLE_LIMIT | 2 |
    When I GET "/health" 5 times
    Then the response status is 200
