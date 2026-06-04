import Link from "next/link";

export default function DocsPage() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-12 font-sans">
      <div className="mb-10">
        <Link href="/" className="text-sm text-gray-500 hover:text-gray-700">← Home</Link>
        <h1 className="text-3xl font-bold text-gray-900 mt-3">SRC Onboarding Guide</h1>
        <p className="text-gray-500 mt-2">
          How to connect your business to the Armenian State Revenue Committee (SRC)
          electronic cash register (ECR / ՀԴՄ) system.
        </p>
      </div>

      {/* Overview */}
      <Section title="Overview" id="overview">
        <p>The Armenian Tax Code (Article 48) requires all businesses with annual turnover above the threshold to issue
          fiscal receipts through a registered electronic cash register (ECR / ՀԴՄ).
          This service connects to the SRC taxservice web API over mutual TLS
          and fiscalizes every receipt in real-time.</p>
        <p className="mt-3">The web service endpoint (production):</p>
        <Code>https://ecrm.taxservice.am/taxsystem-rs-vcr</Code>
      </Section>

      {/* What you need */}
      <Section title="What you need from SRC" id="what-you-need">
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>TIN</strong> (ՀVHH, 8 digits) — your taxpayer identification number</li>
          <li><strong>CRN</strong> — the cash register number issued after u6 application approval</li>
          <li><strong>Signed certificate (.crt)</strong> — issued by SRC after you submit a CSR</li>
          <li><strong>CA root certificate</strong> — download from <code>src.am</code></li>
          <li><strong>Registered server IP</strong> — the outbound IP of your server must be entered in the u6 application</li>
        </ul>
      </Section>

      {/* Step-by-step */}
      <Section title="Step-by-step onboarding" id="steps">
        <StepBlock n={1} title="Register an ECR in ՀNEH">
          <p>Log in to <a href="https://ecrm.taxservice.am" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">ecrm.taxservice.am</a>.
            Go to <strong>Հաշվետvutyunner → Application u6</strong> (ՀDM registration).
            Fill in section 5 &ldquo;Electronic ECR data&rdquo;:</p>
          <ul className="list-disc list-inside mt-2 space-y-1 text-sm">
            <li><strong>5.2 IP address</strong> — enter your server&apos;s outbound static IP. On Render, use a static outbound IP add-on.</li>
            <li><strong>Certificate signing request</strong> — upload the .csr file you generated in this system.</li>
          </ul>
          <p className="mt-2">After SRC approves the application you will receive a CRN and a signed .crt certificate.</p>
        </StepBlock>

        <StepBlock n={2} title="What is a CSR?">
          <p>A <strong>Certificate Signing Request (CSR)</strong> is a file containing your company&apos;s public key
            and identity information (TIN, company name, location). You submit it to SRC, and they sign it
            to produce the trusted certificate your server uses for authentication.</p>
          <p className="mt-2">The CSR subject format required by SRC:</p>
          <Code>CN=&lt;TIN&gt; Tin, OU=&lt;TIN&gt; Tin, O=&lt;TIN&gt; Tin, L=Yerevan, ST=Yerevan, C=AM</Code>
          <p className="mt-2">Generate the CSR from the <Link href="/admin/restaurants" className="text-blue-600 underline">admin dashboard</Link> — no command line needed.</p>
        </StepBlock>

        <StepBlock n={3} title="Convert to PKCS#12 (.p12)">
          <p>After receiving the signed .crt from SRC, combine it with your private key into a .p12 bundle
            (which is what Node.js uses for mutual TLS).</p>
          <p className="mt-2">Using <strong>OpenSSL</strong>:</p>
          <Code>{`openssl pkcs12 -export \\
  -in <TIN>.crt \\
  -inkey <TIN>.key.pem \\
  -CAfile ca_645b34a4865e7.crt \\
  -out <TIN>.p12`}</Code>
          <p className="mt-2">Or use the included script:</p>
          <Code>./scripts/convert-jks-to-p12.sh &lt;TIN&gt; &lt;jksPassword&gt; &lt;p12Password&gt;</Code>
          <p className="mt-2 text-sm text-gray-500">The CA root file (<code>ca_645b34a4865e7.crt</code>) is downloaded from <a href="https://src.am" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">src.am</a> → &ldquo;Electronic Services → New-Generation ECR&rdquo;.</p>
        </StepBlock>

        <StepBlock n={4} title="Upload the .p12 certificate">
          <p>Upload the .p12 file via the onboarding wizard (Step 4). The file is validated immediately
            (wrong password → rejected), and the certificate is stored encrypted in the database.
            The password is encrypted with AES-256-GCM before storage.</p>
          <p className="mt-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
            ⚠ Never share your .p12 file or password. The private key proves your identity to SRC.
          </p>
        </StepBlock>

        <StepBlock n={5} title="Configure departments (configureDepartments)">
          <p>Each fiscal department in your ECR corresponds to a tax regime (VAT, turnover, etc.).
            Call <strong>configureDepartments</strong> once to register your departments with SRC.
            After this step, <strong>getGoodList</strong> becomes available.</p>
          <p className="mt-2">Standard restaurant setup: one department, tax regime 1 (VAT).</p>
        </StepBlock>

        <StepBlock n={6} title="Activate the ECR (activate)">
          <p>After successful certificate connection and department configuration, call <strong>activate</strong>
            to transition the ECR from &ldquo;Current&rdquo; to &ldquo;Active&rdquo; status.
            This must be done <strong>once before printing any receipts</strong>.</p>
          <p className="mt-2 text-sm text-gray-500">If you call activate on an already-active ECR, SRC returns error 195 (CRM_ACTIVATION_FAILED). This is not a problem — it means activation is already complete.</p>
        </StepBlock>

        <StepBlock n={7} title="Print a receipt (print)">
          <p>Send receipt data via <code>POST /api/receipts</code> with an <code>X-Api-Key</code> header.
            The service validates the payload, maps it to the SRC <code>print</code> method, sends it over mTLS,
            and stores the fiscal number and QR data in the database.</p>
          <p className="mt-2">The QR code string format returned by SRC:</p>
          <Code>{`TIN: 00493113, CRN: 52014201, SERIAL: 2FECD1F8,
Receipt_ID: 8, Receipt_Time: 7/16/24 6:34 PM,
FISCAL: 52517829, TOTAL_CASH: 0, TOTAL_NONCASH: 40000,
PREP_USAGE: 0, PARTIAL: 0, TOTAL: 40000`}</Code>
        </StepBlock>
      </Section>

      {/* Security */}
      <Section title="Security checklist" id="security">
        <ul className="space-y-2 text-sm text-gray-700">
          {[
            ["JWT_SECRET", "Set to a random 32+ character string"],
            ["CERT_ENCRYPTION_KEY", "Set to a separate random 32+ character string"],
            ["TAX_API_MODE", "Set to src_real for production"],
            ["HTTPS", "Deploy behind HTTPS (TLS termination at load balancer)"],
            ["Database", "Restrict DB access to the app server's IP only"],
            ["IP registration", "Register the server outbound IP with SRC (u6 app, section 5.2)"],
            ["Certificate", "Never commit .p12/.pem/.key files to git"],
          ].map(([k, v]) => (
            <li key={k} className="flex gap-2">
              <span className="text-green-600 shrink-0">✓</span>
              <span><strong>{k}</strong> — {v}</span>
            </li>
          ))}
        </ul>
      </Section>

      {/* API reference */}
      <Section title="API Quick Reference" id="api">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-2 pr-4 font-medium text-gray-700">Endpoint</th>
                <th className="text-left py-2 pr-4 font-medium text-gray-700">Method</th>
                <th className="text-left py-2 font-medium text-gray-700">Purpose</th>
              </tr>
            </thead>
            <tbody className="text-gray-600">
              {[
                ["/api/auth/login", "POST", "Get JWT token"],
                ["/api/restaurants", "POST", "Create restaurant"],
                ["/api/restaurants/:id/generate-csr", "POST", "Generate RSA keypair + CSR"],
                ["/api/restaurants/:id/csr", "GET", "Download CSR file"],
                ["/api/restaurants/:id/src-config", "POST", "Upload .p12 certificate"],
                ["/api/src/check-connection", "POST", "Test SRC mTLS connection"],
                ["/api/src/activate", "POST", "Activate ECR (once)"],
                ["/api/src/configure-departments", "POST", "Register tax departments"],
                ["/api/receipts", "POST", "Create + fiscalize receipt (X-Api-Key)"],
                ["/api/receipts/:id/pdf", "GET", "Download PDF receipt"],
                ["/api/src/validate-company", "POST", "Full readiness checklist"],
                ["/api/health", "GET", "Health + config check"],
              ].map(([ep, m, d]) => (
                <tr key={ep} className="border-b border-gray-100">
                  <td className="py-2 pr-4 font-mono text-xs text-blue-700">{ep}</td>
                  <td className="py-2 pr-4 text-xs">{m}</td>
                  <td className="py-2 text-xs">{d}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}

function Section({ title, id, children }: { title: string; id: string; children: React.ReactNode }) {
  return (
    <section id={id} className="mb-10">
      <h2 className="text-xl font-bold text-gray-900 mb-4 pb-2 border-b border-gray-200">{title}</h2>
      <div className="text-gray-700 leading-relaxed">{children}</div>
    </section>
  );
}

function StepBlock({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6 flex gap-4">
      <div className="shrink-0 w-8 h-8 rounded-full bg-blue-600 text-white text-sm font-bold flex items-center justify-center">
        {n}
      </div>
      <div className="flex-1">
        <h3 className="font-semibold text-gray-900 mb-2">{title}</h3>
        <div className="text-sm text-gray-700 leading-relaxed">{children}</div>
      </div>
    </div>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <pre className="mt-2 bg-gray-900 text-green-400 text-xs font-mono rounded-lg p-3 overflow-x-auto whitespace-pre-wrap">
      {children}
    </pre>
  );
}
