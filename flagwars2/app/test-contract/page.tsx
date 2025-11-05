"use client";
import { useEffect, useState } from "react";
import { contractReader } from "@/lib/contracts";

export default function TestContractPage() {
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    const testContract = async () => {
      try {
        console.log("Testing contract reader...");
        const countryInfo = await contractReader.getCountryInfo(1);
        console.log("Country info:", countryInfo);
        setResult(countryInfo);
      } catch (e: any) {
        console.error("Contract test error:", e);
        setError(e.message);
      }
    };
    testContract();
  }, []);

  return (
    <div>
      <h1>Contract Test Page</h1>
      {error && (
        <div style={{color: 'red', padding: '1rem', background: '#fee'}}>
          Error: {error}
        </div>
      )}
      {result && (
        <div style={{padding: '1rem', background: '#efe'}}>
          <h2>Result:</h2>
          <pre>{JSON.stringify(result, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}
