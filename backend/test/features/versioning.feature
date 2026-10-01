Feature: API versioning
  Every business endpoint lives under /api/v1.

  Background:
    Given the API is running

  Scenario: Versioned endpoint succeeds
    When I GET "/api/v1/config/public"
    Then the response status is 200

  Scenario Outline: Missing or wrong version prefix returns 404 in the safe error shape
    When I GET "<path>"
    Then the response status is 404
    And the response JSON at "error.code" is "NOT_FOUND"
    And the response JSON at "error.requestId" is a UUID
    And the response body does not contain "Cannot GET"

    Examples:
      | path                  |
      | /api/v2/config/public |
      | /api/config/public    |
      | /config/public        |
      | /v1/config/public     |
