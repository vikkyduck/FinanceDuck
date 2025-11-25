import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { CheckCircle2, XCircle, AlertTriangle, Loader2, Play } from "lucide-react";

interface TestResult {
  name: string;
  passed: boolean;
  message: string;
  duration: number;
}

interface TestSuite {
  suite: string;
  tests: TestResult[];
  passed: number;
  failed: number;
  duration: number;
}

interface TestResults {
  total_suites: number;
  total_tests: number;
  total_passed: number;
  total_failed: number;
  duration: number;
  results: TestSuite[];
}

export function SecurityTestRunner() {
  const [results, setResults] = useState<TestResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runTests = async () => {
    setLoading(true);
    setError(null);
    setResults(null);

    try {
      const { data, error: invokeError } = await supabase.functions.invoke('security-tests', {
        method: 'POST',
      });

      if (invokeError) {
        throw invokeError;
      }

      setResults(data as TestResults);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to run security tests');
      console.error('Security test error:', err);
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (passed: boolean) => {
    if (passed) {
      return <CheckCircle2 className="h-4 w-4 text-green-600" />;
    }
    return <XCircle className="h-4 w-4 text-red-600" />;
  };

  const getSuiteStatusColor = (suite: TestSuite) => {
    if (suite.failed === 0) return "bg-green-500/10 text-green-700 border-green-200";
    if (suite.failed < suite.passed) return "bg-yellow-500/10 text-yellow-700 border-yellow-200";
    return "bg-red-500/10 text-red-700 border-red-200";
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Security Test Suite</CardTitle>
            <CardDescription>
              Automated tests for authentication security, CSRF protection, and session management
            </CardDescription>
          </div>
          <Button onClick={runTests} disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Running Tests...
              </>
            ) : (
              <>
                <Play className="mr-2 h-4 w-4" />
                Run Security Tests
              </>
            )}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {results && (
          <div className="space-y-6">
            {/* Summary */}
            <div className="grid grid-cols-4 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold">{results.total_tests}</div>
                  <p className="text-xs text-muted-foreground">Total Tests</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold text-green-600">{results.total_passed}</div>
                  <p className="text-xs text-muted-foreground">Passed</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold text-red-600">{results.total_failed}</div>
                  <p className="text-xs text-muted-foreground">Failed</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold">{results.duration}ms</div>
                  <p className="text-xs text-muted-foreground">Duration</p>
                </CardContent>
              </Card>
            </div>

            {/* Overall Status */}
            <Alert variant={results.total_failed === 0 ? "default" : "destructive"}>
              {results.total_failed === 0 ? (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  <AlertDescription>
                    All security tests passed! Your authentication system is properly secured.
                  </AlertDescription>
                </>
              ) : (
                <>
                  <XCircle className="h-4 w-4" />
                  <AlertDescription>
                    {results.total_failed} test{results.total_failed > 1 ? 's' : ''} failed. Please review and address the issues below.
                  </AlertDescription>
                </>
              )}
            </Alert>

            {/* Test Suites */}
            <ScrollArea className="h-[600px] w-full rounded-md border">
              <div className="p-4 space-y-6">
                {results.results.map((suite, suiteIndex) => (
                  <div key={suiteIndex} className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <h3 className="text-lg font-semibold">{suite.suite}</h3>
                        <Badge className={getSuiteStatusColor(suite)}>
                          {suite.passed}/{suite.tests.length} passed
                        </Badge>
                      </div>
                      <span className="text-sm text-muted-foreground">{suite.duration}ms</span>
                    </div>

                    <div className="space-y-2">
                      {suite.tests.map((test, testIndex) => (
                        <Card key={testIndex} className={test.passed ? "border-l-4 border-l-green-500" : "border-l-4 border-l-red-500"}>
                          <CardContent className="p-4">
                            <div className="flex items-start justify-between">
                              <div className="flex items-start gap-3 flex-1">
                                {getStatusIcon(test.passed)}
                                <div className="flex-1 min-w-0">
                                  <p className="font-medium text-sm">{test.name}</p>
                                  <p className={`text-sm mt-1 ${test.passed ? 'text-muted-foreground' : 'text-red-600'}`}>
                                    {test.message}
                                  </p>
                                </div>
                              </div>
                              <span className="text-xs text-muted-foreground whitespace-nowrap ml-4">
                                {test.duration > 0 ? `${test.duration}ms` : '—'}
                              </span>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>

                    {suiteIndex < results.results.length - 1 && <Separator />}
                  </div>
                ))}
              </div>
            </ScrollArea>

            {/* Manual Verification Notice */}
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Some tests require manual verification (marked with ⚠). See{" "}
                <a href="/SECURITY_TESTING.md" className="underline hover:text-primary">
                  SECURITY_TESTING.md
                </a>{" "}
                for details.
              </AlertDescription>
            </Alert>
          </div>
        )}

        {!results && !loading && (
          <div className="text-center py-12 text-muted-foreground">
            <Play className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Click "Run Security Tests" to start automated security validation</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
