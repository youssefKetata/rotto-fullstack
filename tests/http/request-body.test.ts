import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  readRequestBytes,
  RequestBodyTooLargeError,
} from "../../src/lib/request-body";
import { ApiError, readObject } from "../../src/lib/api";
import { verifyStripeSignature } from "../../src/lib/billing";

function streamedRequest(chunks: Uint8Array[], onCancel?: () => void) {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      if (!onCancel) controller.close();
    },
    cancel: onCancel,
  });
  return new Request("http://localhost/api/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: stream,
    duplex: "half",
  } as RequestInit);
}

test("streamed webhook bytes retain their signature across UTF-8 chunk boundaries", async () => {
  const raw = new TextEncoder().encode('{"name":"Zoë 東京"}\n');
  const request = streamedRequest([...raw].map((byte) => Uint8Array.of(byte)));
  const bytes = await readRequestBytes(request, raw.byteLength);
  assert.deepEqual(bytes, raw);
  const digest = createHmac("sha256", "test-secret")
    .update("1.")
    .update(raw)
    .digest("hex");
  assert.equal(
    verifyStripeSignature(bytes, `t=1,v1=${digest}`, "test-secret"),
    true,
  );
  assert.equal(request.body?.locked, false);
});

test("oversized streaming input is cancelled and its reader is released", async () => {
  let cancelled = false;
  const request = streamedRequest(
    [Uint8Array.of(1, 2), Uint8Array.of(3)],
    () => {
      cancelled = true;
    },
  );
  await assert.rejects(readRequestBytes(request, 2), RequestBodyTooLargeError);
  assert.equal(cancelled, true);
  assert.equal(request.body?.locked, false);
});

test("JSON requests enforce a byte limit rather than a character count", async () => {
  const raw = new TextEncoder().encode('{"name":"東京"}');
  await assert.rejects(
    readObject(streamedRequest([raw]), raw.byteLength - 1),
    (error: unknown) => error instanceof ApiError && error.status === 413,
  );
  assert.deepEqual(await readObject(streamedRequest([raw]), raw.byteLength), {
    name: "東京",
  });
});

test("JSON requests reject invalid UTF-8 and non-object JSON", async () => {
  for (const bytes of [
    Uint8Array.of(0xff),
    new TextEncoder().encode("null"),
    new TextEncoder().encode("[]"),
  ]) {
    await assert.rejects(
      readObject(streamedRequest([bytes])),
      (error: unknown) => error instanceof ApiError && error.status === 400,
    );
  }
});

test("an empty unsigned body is read as bytes but is not a valid JSON object", async () => {
  assert.deepEqual(
    await readRequestBytes(new Request("http://localhost"), 10),
    new Uint8Array(),
  );
  await assert.rejects(
    readObject(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }),
    ),
    (error: unknown) => error instanceof ApiError && error.status === 400,
  );
});
