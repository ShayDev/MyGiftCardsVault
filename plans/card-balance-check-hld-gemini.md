### The Truth About Israeli Gift Card Providers & APIs

You hit the nail on the head in your HLD note: **None of the seeded Israeli gift card providers (BuyMe, HitechZone, Max/MyGift, Isracard, Cal, Nofshonit, etc.) publish a public, documented balance API.**

Even worse: most of them employ **anti-bot protections** (like Cloudflare, PerimeterX/HUMAN, or ReCAPTCHA) on their web-facing endpoints to prevent automated scraping or credential-stuffing attacks.

Here is what the architectural landscape actually looks like per provider if you want to implement this:

---

### 1. BuyMe (`buyme.co.il`)

- **How their frontend works:** BuyMe operates a Single Page Application (Vue/Nuxt or React). When a user clicks "בדיקת יתרה" (Balance Check) on their website, the web UI makes an internal AJAX/XHR call to their backend API.
- **Request Shape:** Typically a `POST` request to an internal API endpoint (e.g., `/api/v1/voucher/balance` or similar graphql/REST endpoint) carrying a JSON payload.
- **Parameters Needed:** **Voucher Code** (usually a numeric or alphanumeric barcode string). BuyMe generally does not require a separate PIN/CVV for checking balance—just the full code.
- **Response Shape:** A structured JSON object containing `balance`, `originalAmount`, `expirationDate`, and card status.
- **The Catch (Auth/Security):** They are protected by Web Application Firewalls (Cloudflare/PerimeterX). Making a raw server-side `fetch()` or `axios.post()` from a Node/Python backend will almost certainly yield a `403 Forbidden` or challenge page unless you use a headless browser or reverse-engineered session tokens/fingerprinting.
- **Unofficial Developer Ecosystem:** Because there is no official API, open-source developers have resorted to building wrappers and personal CLI/MCP tools (for instance, unofficial community projects on Glama/GitHub like `buyme-mcp` that wrap local authentication or session tokens to inspect gift card wallets).

---

### 2. Max / MyGift (`mygift` / LeumiCard)

- **How their frontend works:** Max operates the "MyGift" platform. Checking balances requires going through their dedicated portal or mobile app.
- **Request Shape:** `POST` request to an internal gateway.
- **Parameters Needed:** Both **Card Number (16 digits)** AND **CVV/PIN (4-6 digits)** (located under the scratch-off on physical cards or in the SMS for digital cards).
- **Response Shape:** JSON with `availableBalance`, `validThru`, and often a transaction history array.
- **The Catch:** Max uses strict CORS policies, token-based session verification, and sometimes SMS OTP challenges if you try to query multiple cards from an unrecognized IP.

---

### 3. HitechZone / Isracard / Cal (Vouchers & Cards)

- **How they work:** HitechZone and Isracard gift cards often route their balance checks through third-party processing clearing houses (like Multipass, PLACARD, or internal banking APIs).
- **Parameters Needed:** Usually require **Card Number + CVV/ID**. In some Isracard cases, checking a balance requires authenticating into a user's personal area (Teudat Zehut + Last 6 digits of credit card / SMS OTP), making purely anonymous programmatic checks impossible without user credentials.
- **Response Shape:** Varies wildly—from clean JSON (if hitting their mobile app APIs) to legacy HTML tables that require HTML DOM scraping (`cheerio` / `JSDOM`).

---

### How to Implement It: The "Plumbing + Adapter" Blueprint

Since you are building **provider-agnostic plumbing** with a **per-provider adapter registry** (and shipping with 0 working adapters initially), here is the concrete technical spec for how to architect the contract so that when you _do_ reverse-engineer or officially partner with a provider, it slots right in.

```
       +----------------------------------------------------+
       |                  UI / CLIENT LAYER                 |
       |  - Renders dynamic form fields based on `schema`   |
       |  - Calls Server Action: `checkBalance(provider, ...)`|
       +-------------------------+--------------------------+
                                 |
                                 v
       +----------------------------------------------------+
       |              SERVER ACTION / CONTROLLER            |
       |  - Looks up provider in Adapter Registry           |
       |  - Validates input against provider schema         |
       +-------------------------+--------------------------+
                                 |
                                 v
       +----------------------------------------------------+
       |               PROVIDER ADAPTER REGISTRY            |
       |  - Map<ProviderId, BalanceAdapter>                 |
       +-------------------------+--------------------------+
         /                       |                        \
        v                        v                         v
+---------------+        +---------------+         +---------------+
| BuyMeAdapter  |        |  MaxAdapter   |         | DummyAdapter  |
| (POST JSON /  |        | (POST JSON +  |         | (For dev/test |
|  Headless)    |        |  PIN required)|         |  mocking)     |
+---------------+        +---------------+         +---------------+

```

#### Step 1: Define the Universal Interface & Schema

Each provider adapter must expose both its **Input Requirements** (so the UI knows whether to prompt for a PIN/CVV or just a Card Number) and its **Execution Method**.

```typescript
// 1. Unified Response Shape (What UI expects back)
export interface BalanceCheckResult {
  success: boolean;
  currency: string; // e.g., "ILS"
  balance?: number; // e.g., 250.50
  originalValue?: number; // e.g., 500.00
  expirationDate?: string; // ISO string
  error?: string; // Localized error message
  raw?: unknown; // Optional debug payload
}

// 2. What fields the UI needs to display to the user
export interface ProviderFieldRequirement {
  name: "cardNumber" | "pin" | "cvv" | "idNumber";
  label: string;
  required: boolean;
  regex?: string; // For frontend validation (e.g., '^[0-9]{16}$')
}

// 3. The Adapter Interface
export interface BalanceAdapter {
  providerId: string;
  name: string;
  fields: ProviderFieldRequirement[];

  // The actual programmatic execution
  fetchBalance(
    credentials: Record<string, string>,
  ): Promise<BalanceCheckResult>;
}
```

#### Step 2: Build the Adapter Registry

Create a registry where adapters are registered. Ship initially with a **Mock/Dummy Adapter** so your UI/UX plumbing can be verified without breaking WAF rules.

```typescript
// registry.ts
import { BalanceAdapter } from "./types";
import { DummyAdapter } from "./adapters/dummy";

const adapters = new Map<string, BalanceAdapter>();

// Register adapters
adapters.set("dummy", new DummyAdapter());
// adapters.set('buyme', new BuyMeAdapter()); // <-- Future concrete step

export function getAdapter(providerId: string): BalanceAdapter {
  const adapter = adapters.get(providerId);
  if (!adapter) {
    throw new Error(
      `No balance adapter registered for provider: ${providerId}`,
    );
  }
  return adapter;
}
```

#### Step 3: Implement a "Concrete" Adapter (Reverse-Engineering Strategy)

When you are ready to write the first real adapter (e.g., for **BuyMe** or **Max**), you will implement one of two patterns inside the adapter's `fetchBalance()` method:

- **Pattern A: Internal REST API Emulation (Fastest, but brittle)**

1. Open Chrome DevTools -> Network Tab -> filter by `XHR/Fetch`.
2. Perform a manual balance check on the provider's website.
3. Copy as cURL to inspect headers (User-Agent, Content-Type, Session Cookies).
4. Implement an `http` client (`fetch` / `axios`) in your server action that mimics those headers.
5. _Warning:_ If they use Cloudflare Bot Management, this will start throwing HTTP `403`s after a few requests.

- **Pattern B: Headless Scraper / Automation (Slower, but bypasses WAFs)**
  If pure HTTP fetch is blocked by bot protections, your server-side adapter will need to use **Playwright** or **Puppeteer** (running headless):

```typescript
// Example mental model for a future scraped adapter
async fetchBalance(credentials: Record<string, string>): Promise<BalanceCheckResult> {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await page.goto('https://buyme.co.il/balance-check-url');
    await page.fill('input[name="voucherCode"]', credentials.cardNumber);
    await page.click('button[type="submit"]');

    // Wait for network response or UI element to render
    await page.waitForSelector('.balance-amount', { timeout: 5000 });
    const balanceText = await page.innerText('.balance-amount');

    return {
      success: true,
      currency: 'ILS',
      balance: parseFloat(balanceText.replace(/[^0-9.]/g, '')),
    };
  } catch (e) {
    return { success: false, currency: 'ILS', error: 'Failed to scrape balance' };
  } finally {
    await browser.close();
  }
}

```

---

### Summary of Next Steps for Your HLD

1. **Approve the Agnostic Blueprint:** Your proposed HLD approach—building the schema, server action, and UI around an adapter registry with zero real adapters—is the architecturally correct move.
2. **Handle Dynamic Form Input in UI:** Ensure your UI checks `adapter.fields` so it dynamically renders an extra "PIN / CVV" input box for cards like _Max/MyGift_, but only a single "Voucher Code" input box for cards like _BuyMe_.
3. **Phase 2 (Discovery):** To build the first real adapter, assign a task to inspect the Network tab for the target provider, document its JSON schema, and determine if an HTTP POST is sufficient or if an automated headless browser (Playwright) worker is required to evade Israeli WAFs.
