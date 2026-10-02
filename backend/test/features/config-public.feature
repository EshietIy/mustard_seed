Feature: Public configuration
  The frontend reads the payment mode to decide whether to show the TEST MODE banner.

  Scenario: Simulator enabled reports simulated payments
    Given the API is running with:
      | PAYSTACK_SIMULATOR_ENABLED | true |
    When I GET "/api/v1/config/public"
    Then the response status is 200
    And the response JSON at "paymentMode" is "simulated"
    And the response JSON at "googleClientId" is "1234567890-bddtest.apps.googleusercontent.com"

  Scenario: Simulator disabled reports live payments
    Given the API is running with:
      | PAYSTACK_SIMULATOR_ENABLED | false |
    When I GET "/api/v1/config/public"
    Then the response status is 200
    And the response JSON at "paymentMode" is "live"

  Scenario: Unsupported method on the endpoint is rejected
    Given the API is running
    When I POST "/api/v1/config/public"
    Then the response status is 404
    And the response JSON at "error.code" is "NOT_FOUND"
