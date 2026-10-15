# Domain switch: momentsinlight.co.nz to the new site

Started 15 Oct 2026. The domain stays registered with **iwantmyname**; only its DNS moves to
**Cloudflare** (Free plan), because Cloudflare Pages can only serve the bare domain
(`momentsinlight.co.nz`, without www) when Cloudflare runs the DNS. Email (Google Workspace)
keeps working throughout, as its records were copied across first.

## Status

| Step | Status |
| --- | --- |
| 1. Domain added to Cloudflare, records copied and checked | Done 15 Oct |
| 2. Nameservers changed at iwantmyname to `dora.ns.cloudflare.com`, `eoin.ns.cloudflare.com` | Done 15 Oct; registry switched and Cloudflare Active the same evening |
| 3. Domain pointed at the new site: www and bare domain on the Pages project, root-to-www redirect (301, query string kept), Turnstile hostnames | Done 15 Oct |
| 4. Live checks | Done 15 Oct: all 121 sitemap pages 200 with correct canonical, all 34 redirects, 404, http to https, bare domain to www, contact form, Google Analytics, Turnstile widget. Still to do: a real guide signup, Search Console, cancel Squarespace later |

DNSSEC was checked and is off (no DS record at the `.nz` registry), so nothing needed turning off first.

## DNS records

Copied from iwantmyname to Cloudflare. NS and SOA records aren't copied; Cloudflare has its own.

| Type | Name | Content | Proxy | What it's for |
| --- | --- | --- | --- | --- |
| A ×4 | `@` | 198.185.159.144, 198.185.159.145, 198.49.23.144, 198.49.23.145 | DNS only | Squarespace; replaced in step 3 |
| CNAME | `www` | ext-cust.squarespace.com | DNS only | Squarespace; replaced in step 3 |
| CNAME | `29xjn5tj5jwdg…` | verify.squarespace.com | DNS only | Squarespace domain verification; delete when Squarespace is cancelled |
| MX | `@` | smtp.google.com, priority 1 | | **Email (Google)** |
| MX | `@` | tplnxmzjsgibx37oeqyqcpipffnxal2ntb7wy6onsrlqrssw2lmq.mx-verification.google.com, priority 15 | | Google verification |
| TXT | `@` | `v=spf1 include:_spf.google.com include:spf.studioninja.co ~all` | | **Email sending (Google, Studio Ninja)** |
| TXT | `google._domainkey` | `v=DKIM1; k=rsa; p=MIIBIjAN…IDAQAB` (two quoted parts) | | **Email signing**; checked character for character |
| TXT | `@` | google-site-verification=m9bbsymRkBvv7iQxAT0PKVtwL02Yf2x5zZRXCMpW0tk | | Google |
| TXT | `@` | google-site-verification=r3jklZxuvhKxWKnUlqYLoP_Gwkk0ztoFkYRUy55bjIM | | Google |
| TXT | `@` | pinterest-site-verification=47acec56c543b9bd6056e43bb6589ee1 | | Pinterest |

The Squarespace records are DNS only (grey cloud) on purpose: proxying Squarespace through
Cloudflare during the switch risks certificate errors. Cloudflare's "not fully protected"
warning about this can be ignored.

The old records are still in iwantmyname's DNS list, unused; switching the nameservers back
there would undo everything.

## Step 3: point the domain at the new site (once Cloudflare says Active)

1. **Workers & Pages > momentsinlight-website > Custom domains > Set up a custom domain:**
   add `www.momentsinlight.co.nz` and accept the DNS update (replaces the Squarespace www record).
2. Do the same for `momentsinlight.co.nz`; delete the four Squarespace A records if asked.
3. **Rules > Redirect Rules > Create rule**, template **Redirect from root to WWW**: 301,
   preserve query string. (The site's address is www, as on Squarespace.)
4. **Turnstile** widget: add `momentsinlight.co.nz` and `www.momentsinlight.co.nz` to its
   hostnames, or the guide signup form will reject people on the real domain.

## Step 4: after the switch

- Test on the real domain: every sitemap page, the old Squarespace addresses in `public/_redirects`,
  `momentsinlight.co.nz` redirecting to www, HTTPS, the guide signup (and its D1 entry), the
  Studio Ninja contact form, and that email still arrives.
- Old `/sitemap.xml` (Squarespace's) redirects to `/sitemap-index.xml`.
- Canonical tags were fixed on the day of the switch: they ended in `.html` on every page except Home; they now match the real addresses.
- Google Search Console: submit `https://www.momentsinlight.co.nz/sitemap-index.xml`.
- Studio Ninja's contact form sends people to `/thanks`, which exists on the new site.
- Keep Squarespace a few weeks as a fallback (nothing on the new site uses it, photos included),
  then cancel it and delete the `verify.squarespace.com` record.
- Optional: turn on DNSSEC in Cloudflare (it gives a DS record to add at iwantmyname).

## Going back, if ever needed

Change the nameservers at iwantmyname back to `dns1/dns2/dns3.iwantmyname.com`; its DNS
records still point at Squarespace.
