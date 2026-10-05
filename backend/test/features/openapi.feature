Feature: The published API spec
  The Android app's client is generated from /api/docs-json, so the spec must describe every
  shape exactly (AGENT.md section 15): no untyped objects, and whole numbers as integers.

  Scenario: Every schema property is fully typed and whole numbers are integers
    Given the API is running
    When I GET "/api/docs-json"
    Then the response status is 200
    And the spec has no untyped objects
    And the spec has no fractional numbers
