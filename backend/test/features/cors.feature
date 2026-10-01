Feature: CORS
  Only exact, configured origins may call the API from a browser.

  Background:
    Given the API is running with:
      | CORS_ALLOWED_ORIGINS | https://mustardseed.ng |

  Scenario: The production site origin is allowed
    When I GET "/api/v1/config/public" from origin "https://mustardseed.ng"
    Then the response status is 200
    And the response header "access-control-allow-origin" is "https://mustardseed.ng"
    And the response header "access-control-allow-credentials" is "true"

  Scenario: Preflight from the allowed origin lists only the methods the API uses
    When I send a preflight for "POST" "/api/v1/config/public" from origin "https://mustardseed.ng"
    Then the response status is 204
    And the response header "access-control-allow-origin" is "https://mustardseed.ng"
    And the response header "access-control-allow-methods" is "GET,POST,PUT,PATCH,DELETE,OPTIONS"
    And the response header "access-control-allow-headers" is "Content-Type,X-Request-Id"

  Scenario Outline: Other origins are rejected and logged
    When I GET "/api/v1/config/public" from origin "<origin>"
    Then the response header "access-control-allow-origin" is absent
    And a "warn" log entry has:
      | event  | cors.rejected |
      | origin | <origin>      |

    Examples:
      | origin                          |
      | https://evil.com                |
      | https://mustardseed.ng.evil.com |
      | http://mustardseed.ng           |
      | https://www.mustardseed.ng      |

  Scenario: Preflight from another origin gets no CORS headers
    When I send a preflight for "POST" "/api/v1/config/public" from origin "https://evil.com"
    Then the response header "access-control-allow-origin" is absent
    And the response header "access-control-allow-methods" is absent
