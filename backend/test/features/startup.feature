Feature: Startup configuration guard
  The app fails fast on bad configuration and never runs the simulator in production.

  Scenario: Production refuses to start with the simulator enabled
    When the API starts with:
      | APP_ENV                    | production             |
      | CORS_ALLOWED_ORIGINS       | https://mustardseed.ng |
      | PAYSTACK_SIMULATOR_ENABLED | true                   |
    Then startup fails with a message containing "PAYSTACK_SIMULATOR_ENABLED"

  Scenario: Production refuses to start when the Paystack URL points at the simulator
    When the API starts with:
      | APP_ENV              | production                                  |
      | CORS_ALLOWED_ORIGINS | https://mustardseed.ng                      |
      | PAYSTACK_BASE_URL    | https://api.mustardseed.ng/simulator/paystack |
    Then startup fails with a message containing "PAYSTACK_BASE_URL"

  Scenario: Missing APP_ENV refuses to start
    When the API starts with:
      | CORS_ALLOWED_ORIGINS | https://mustardseed.ng |
    Then startup fails with a message containing "APP_ENV"

  Scenario: Unknown APP_ENV refuses to start
    When the API starts with:
      | APP_ENV              | development            |
      | CORS_ALLOWED_ORIGINS | https://mustardseed.ng |
    Then startup fails with a message containing "APP_ENV"

  Scenario: Wildcard CORS origin refuses to start
    When the API starts with:
      | APP_ENV              | local |
      | CORS_ALLOWED_ORIGINS | *     |
    Then startup fails with a message containing "CORS_ALLOWED_ORIGINS"

  Scenario: Staging with NODE_ENV=production may run the simulator
    When the API starts with:
      | APP_ENV                    | staging                                           |
      | NODE_ENV                   | production                                        |
      | CORS_ALLOWED_ORIGINS       | https://staging.mustardseed.ng                    |
      | PAYSTACK_SIMULATOR_ENABLED | true                                              |
      | PAYSTACK_BASE_URL          | https://staging-api.mustardseed.ng/simulator/paystack |
    Then startup succeeds
    When I GET "/api/v1/config/public"
    Then the response JSON is:
      """
      { "paymentMode": "simulated" }
      """
