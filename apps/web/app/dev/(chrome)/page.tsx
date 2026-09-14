export default function DevIndexPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Visual preview surfaces</h1>
        <p className="mt-2 text-gray-600">
          Mock routes use <strong>MockStorefrontClient</strong>. Live routes call the Storefront
          API (requires seeded publishable key and active property).
        </p>
      </div>

      <section>
        <h2 className="font-semibold">Mock</h2>
        <ul className="mt-2 list-inside list-disc space-y-2 text-gray-800">
          <li>
            <a href="/dev/widget-react" className="text-emerald-700 underline">
              /dev/widget-react
            </a>{" "}
            — React BookingWidget
          </li>
          <li>
            <a href="/dev/widget-embed" className="text-emerald-700 underline">
              /dev/widget-embed
            </a>{" "}
            — JS embed API + iframe
          </li>
          <li>
            <a href="/dev/widget-iframe" className="text-emerald-700 underline">
              /dev/widget-iframe
            </a>{" "}
            — iframe host (mock)
          </li>
          <li>
            <a href="/dev/storefront-mock" className="text-emerald-700 underline">
              /dev/storefront-mock
            </a>{" "}
            — Headless SDK mock flow
          </li>
        </ul>
      </section>

      <section>
        <h2 className="font-semibold">Live API</h2>
        <ul className="mt-2 list-inside list-disc space-y-2 text-gray-800">
          <li>
            <a href="/dev/widget-live" className="text-emerald-700 underline">
              /dev/widget-live
            </a>{" "}
            — React widget → Storefront API
          </li>
          <li>
            <a href="/dev/embed-live" className="text-emerald-700 underline">
              /dev/embed-live
            </a>{" "}
            — window.HCP.init mount
          </li>
          <li>
            <a href="/dev/iframe-live" className="text-emerald-700 underline">
              /dev/iframe-live
            </a>{" "}
            — iframe + postMessage
          </li>
          <li>
            <a href="/w/embed" className="text-emerald-700 underline">
              /w/embed
            </a>{" "}
            — Hosted iframe widget page
          </li>
        </ul>
      </section>
    </div>
  );
}
