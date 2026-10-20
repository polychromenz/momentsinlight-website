# Social media: applying for Google and Pinterest posting

Facebook and Instagram post themselves from Studio > Social (milestone 2). Google Business Profile
and Pinterest each need an application before the studio can post for you. Send these when you're
ready. Approval takes days to weeks; the studio's side gets built once they say yes.

## Google Business Profile API

1. Sign in to the [Google Cloud console](https://console.cloud.google.com) with the Google account that
   manages your Business Profile. Use the existing project (moments-studio-511901).
2. Fill in the [GBP API access request form](https://developers.google.com/my-business/content/prereqs#request-access)
   (linked from "Request access to the API" on that page).
3. Suggested answers:
   - **Business name:** Moments in Light
   - **Website:** https://www.momentsinlight.co.nz
   - **Project number:** from the Cloud console's project dashboard
   - **How many locations:** 1 (your own business only)
   - **What the integration does:** "An in-house tool for our own photography business. It publishes
     posts (photo updates) to our own Business Profile on a schedule, after the owner approves each
     post. It reads our own reviews to suggest posts. It doesn't manage any other business's profile."
4. When approved, Google enables the APIs (My Business Business Information, Business Profile
   Performance, and the v4 posts API). Tell Claude, and the Google connection gets built.

## Pinterest API

1. Make sure your Pinterest account is a **business account** (Settings > Account management).
2. Go to [Pinterest Developers](https://developers.pinterest.com/apps/) and click **Connect app**.
3. Suggested details:
   - **App name:** Moments in Light Studio
   - **Website:** https://www.momentsinlight.co.nz
   - **Privacy policy:** https://www.momentsinlight.co.nz/privacy
   - **Description:** "An in-house tool for our own wedding photography business. It creates Pins on
     our own boards from our blog posts and galleries, on a schedule, after the owner approves each
     one. It doesn't access any other user's account."
   - **Redirect URI:** https://www.momentsinlight.co.nz/api/studio/pinterest/callback
4. Pinterest starts you on **Trial access** (Pins you create are only visible to you). Request
   **Standard access** from the app's page; they may ask for a short screen recording of the studio
   creating a Pin. Claude can help put that together once the trial connection works.
