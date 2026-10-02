Feature: Paystack Simulator
  A stand-in for Paystack's API, checkout page and webhooks, for local, test and staging only.

  Background:
    Given the API is running

  Scenario Outline: Control endpoints are hidden without the right key
    When I call the simulator control API with key "<key>"
    Then the simulator control API answers 404

    Examples:
      | key                 |
      | <none>              |
      | wrong-control-key   |

  Scenario: Control endpoints work with the right key
    When I call the simulator control API with key "bdd-simulator-control-key"
    Then the simulator control API answers 200

  Scenario Outline: Initialize rejects a missing or wrong bearer key
    When I call the simulator API with the bearer key "<key>"
    Then the simulator answers 401 with message "Invalid key"

    Examples:
      | key                      |
      | sk_sim_wrong_key_0000000 |
      |                          |

  Scenario Outline: Initialize rejects invalid input like Paystack
    When I initialize a simulator transaction with:
      """
      <body>
      """
    Then the simulator answers 400 with message "<message>"

    Examples:
      | body                                          | message                     |
      | { "email": "not-an-email", "amount": 100 }    | Invalid Email Address Passed |
      | { "email": "a@b.co", "amount": 0 }            | Invalid Amount Sent         |
      | { "email": "a@b.co", "amount": 10.5 }         | Invalid Amount Sent         |

  Scenario: Initialize rejects a duplicate reference
    When I initialize a simulator transaction with:
      """
      { "email": "a@b.co", "amount": 100, "reference": "dup-ref-0001" }
      """
    And I initialize a simulator transaction with:
      """
      { "email": "a@b.co", "amount": 100, "reference": "dup-ref-0001" }
      """
    Then the simulator answers 400 with message "Duplicate Transaction Reference"

  Scenario: The simulator is not mounted when disabled
    Given the API is running with:
      | PAYSTACK_SIMULATOR_ENABLED | false                   |
      | PAYSTACK_SECRET_KEY        | sk_test_bdd_0123456789  |
      | PAYSTACK_BASE_URL          | https://api.paystack.co |
    When I GET "/simulator/paystack/checkout/anything"
    Then the response status is 404
    When I GET "/api/v1/config/public"
    Then the response JSON at "paymentMode" is "live"
