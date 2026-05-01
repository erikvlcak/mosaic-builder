import { useEffect, useState } from "react";

export function App(): JSX.Element {
  const [pong, setPong] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    window.api
      .ping()
      .then((n) => setPong(n))
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err));
      });
  }, []);

  return (
    <main
      style={{
        fontFamily: "system-ui, sans-serif",
        padding: 24,
        color: "#333",
      }}
    >
      <h1>Mosaic Builder</h1>
      <p data-testid="status">
        {error !== null
          ? `error: ${error}`
          : pong !== null
            ? `pong from main: ${pong}`
            : "pinging…"}
      </p>
    </main>
  );
}
