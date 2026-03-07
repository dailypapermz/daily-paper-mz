export default function HomePage() {
  return (
    <main>
      <h1>Daily Paper</h1>
      <p>Base scaffold is ready. Feature modules are being added issue by issue.</p>
      <p>
        Health endpoint: <code>/api/health</code>
      </p>
      <p>
        Collection priorities: <a href="/collections">/collections</a>
      </p>
      <form method="post" action="/api/profile/refresh">
        <button type="submit">Run Manual Profile Refresh</button>
      </form>
      <p>
        Refresh status endpoint: <code>/api/profile/refresh</code>
      </p>
      <p>
        Monthly reminder check endpoint: <code>/api/profile/reminder</code>
      </p>
    </main>
  );
}
