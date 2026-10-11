import assert from "node:assert/strict";
import { test } from "node:test";
import { isSameOrigin } from "../../src/lib/auth-response";

function request(headers: HeadersInit) {
  return new Request("http://localhost:3000/api/auth/login", { headers });
}

test("origin checks use the public host and protocol", () => {
  const cases: HeadersInit[] = [
    { Origin: "http://localhost:3000" },
    { Origin: "http://127.0.0.1:3000", Host: "127.0.0.1:3000" },
    { Origin: "http://[::1]:3000", Host: "[::1]:3000" },
    {
      Origin: "https://rotto.example.com",
      Host: "internal:3000",
      "X-Forwarded-Host": "rotto.example.com",
      "X-Forwarded-Proto": "https",
    },
    {
      Origin: "https://rotto.example.com",
      "X-Forwarded-Host": "rotto.example.com, internal:3000",
      "X-Forwarded-Proto": "https, http",
    },
    {
      Origin: "https://rotto.example.com",
      "X-Forwarded-Host": "rotto.example.com:443",
      "X-Forwarded-Proto": "https",
    },
  ];
  for (const headers of cases) {
    assert.equal(isSameOrigin(request(headers)), true, JSON.stringify(headers));
  }
});

test("origin checks reject other hosts, ports, protocols and malformed headers", () => {
  for (const origin of [
    "https://attacker.example.com",
    "https://rotto.example.com:444",
    "http://rotto.example.com",
    "http://localhost:3000",
    "https://rotto.example.com/path",
    "https://rotto.example.com.attacker.test",
    "null",
    "invalid",
    "",
  ]) {
    assert.equal(
      isSameOrigin(
        request({
          Origin: origin,
          Host: "localhost:3000",
          "X-Forwarded-Host": "rotto.example.com",
          "X-Forwarded-Proto": "https",
        }),
      ),
      false,
      origin,
    );
  }
  const malformedHeaders: HeadersInit[] = [
    { Origin: "http://localhost:3000", "X-Forwarded-Host": "" },
    { Origin: "http://localhost:3000", "X-Forwarded-Host": "invalid host" },
    { Origin: "http://localhost:3000", "X-Forwarded-Proto": "ftp" },
  ];
  for (const headers of malformedHeaders) {
    assert.equal(
      isSameOrigin(request(headers)),
      false,
      JSON.stringify(headers),
    );
  }
});

test("clients without an Origin header can still use auth endpoints", () => {
  assert.equal(isSameOrigin(request({})), true);
});
