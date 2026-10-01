Feature: Public configuration
  The frontend reads the payment mode to decide whether to show the TEST MODE banner.

  Scenario: Simulator enabled reports simulated payments
    Given the API is running with:
      | PAYSTACK_SIMULATOR_ENABLED | true |
    When I GET "/api/v1/config/public"
    Then the response status is 200
    And the response JSON is:
      """
      { "paymentMode": "simulated" }
      """

  Scenario: Simulator disabled reports live payments
    Given the API is running with:
      | PAYSTACK_SIMULATOR_ENABLED | false |
    When I GET "/api/v1/config/public"
    Then the response status is 200
    And the response JSON is:
      """
      { "paymentMode": "live" }
      """

  Scenario: Unsupported method on the endpoint is rejected
    Given the API is running
    When I POST "/api/v1/config/public"
    Then the response status is 404
    And the response JSON at "error.code" is "NOT_FOUND"
