import { useEffect, useState } from 'react';

type HealthResponse = {
  status: string;
  service: string;
  timestamp: string;
};

function App() {
  const [data, setData] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/health')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((json: HealthResponse) => setData(json))
      .catch((err: Error) => setError(err.message));
  }, []);

  if (error) {
    return <pre>Error: {error}</pre>;
  }

  if (!data) {
    return <pre>Loading...</pre>;
  }

  return <pre>{JSON.stringify(data, null, 2)}</pre>;
}

export default App;
