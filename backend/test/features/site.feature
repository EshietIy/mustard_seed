Feature: Restaurant and branch information
  The landing page reads hours, delivery fee, contact and branches from the API,
  so placeholders can be replaced with real details without a code change.

  Background:
    Given the API is running

  Scenario: Site information with placeholders not yet supplied
    When I GET "/api/v1/site"
    Then the response status is 200
    And the response JSON at "name" is "Mustard Seed Restaurant & Bar"
    And the response JSON at "phoneWhatsapp" is JSON:
      """
      null
      """
    And the response JSON at "hours" is JSON:
      """
      { "opensAt": "08:00", "closesAt": "23:00", "onlineOrdersCloseAt": "22:30", "timezone": "Africa/Lagos" }
      """
    And the response JSON at "delivery" is JSON:
      """
      { "feeKobo": 150000, "area": "Calabar" }
      """
    And the response JSON at "branches" is JSON:
      """
      [
        { "id": "calabar", "city": "Calabar", "state": "Cross River State", "role": "headquarters",
          "streetAddress": null, "onlineOrderingEnabled": true },
        { "id": "uyo", "city": "Uyo", "state": "Akwa Ibom State", "role": "branch",
          "streetAddress": "97 Tunde Ukpehe (Mitama), Uyo", "onlineOrderingEnabled": false }
      ]
      """

  Scenario: Real details replace the placeholders once supplied
    Given the Calabar street address is "12 Example Street, Calabar"
    And the phone number is "+234 800 000 0000"
    When I GET "/api/v1/site"
    Then the response JSON at "branches.0.streetAddress" is "12 Example Street, Calabar"
    And the response JSON at "phoneWhatsapp" is "+234 800 000 0000"

  Scenario: The database is unavailable
    Given the database is unreachable
    When I GET "/api/v1/site"
    Then the response status is 503
    And the response JSON at "error.code" is "SERVICE_UNAVAILABLE"
    And an "error" log entry has:
      | upstream | supabase |
      | outcome  | FAILED   |

  Scenario: The settings row is missing (misconfigured database)
    Given the restaurant settings row is missing
    When I GET "/api/v1/site"
    Then the response status is 500
    And the response JSON at "error.code" is "INTERNAL_ERROR"
    And the response body does not contain "restaurant_info"
    And an "error" log entry has:
      | errorCode | INTERNAL_ERROR |
      | reason    | restaurant_info row is missing |
