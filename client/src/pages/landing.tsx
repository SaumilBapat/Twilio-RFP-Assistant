import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle, FileSpreadsheet, Bot, Zap, Shield, Users } from "lucide-react";
import { useEffect, useState } from "react";

export default function Landing() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Check for error in URL params
    const params = new URLSearchParams(window.location.search);
    const errorType = params.get('error');
    const errorMessage = params.get('message');
    
    if (errorType) {
      if (errorType === 'auth_error') {
        setError(`Authentication error: ${errorMessage || 'Unknown error occurred'}`);
      } else if (errorType === 'auth_failed') {
        setError(`Authentication failed: ${errorMessage || 'Unable to authenticate with Google'}`);
      } else if (errorType === 'login_error') {
        setError(`Login error: ${errorMessage || 'Failed to establish session'}`);
      } else {
        setError(errorMessage || 'An error occurred during authentication');
      }
      // Clean URL
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      {error && (
        <div className="max-w-7xl mx-auto px-6 pt-4">
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </div>
      )}
      {/* Header */}
      <header className="w-full p-6">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <Bot className="h-8 w-8 text-blue-600" />
            <span className="text-2xl font-bold text-gray-900 dark:text-white">RFP Assistant</span>
          </div>
          <Button 
            onClick={() => {
              window.location.href = '/api/auth/google';
            }}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            Sign In with Google
          </Button>
        </div>
      </header>

      {/* Hero Section */}
      <main className="max-w-7xl mx-auto px-6 py-12">
        <div className="text-center mb-16">
          <h1 className="text-5xl font-bold text-gray-900 dark:text-white mb-6">
            AI-Powered RFP Processing
            <span className="block text-blue-600">For Twilio Teams</span>
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-300 mb-8 max-w-3xl mx-auto">
            Transform your RFP and security questionnaire workflows with intelligent AI processing. 
            Upload CSV files, configure custom agent pipelines, and get comprehensive responses in real-time.
          </p>
          <Button 
            size="lg"
            onClick={() => {
              window.location.href = '/api/auth/google';
            }}
            className="bg-blue-600 hover:bg-blue-700 text-white text-lg px-8 py-4"
          >
            Get Started Now
          </Button>
        </div>

        {/* Features Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 mb-16">
          <Card>
            <CardHeader>
              <FileSpreadsheet className="h-10 w-10 text-blue-600 mb-2" />
              <CardTitle>CSV Processing</CardTitle>
              <CardDescription>
                Upload and process large CSV files with up to 5,000 rows and 25MB file size
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-300">
                <li className="flex items-center"><CheckCircle className="h-4 w-4 text-green-500 mr-2" />Automatic validation</li>
                <li className="flex items-center"><CheckCircle className="h-4 w-4 text-green-500 mr-2" />Real-time preview</li>
                <li className="flex items-center"><CheckCircle className="h-4 w-4 text-green-500 mr-2" />Spreadsheet editing</li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <Bot className="h-10 w-10 text-blue-600 mb-2" />
              <CardTitle>AI Agent Pipelines</CardTitle>
              <CardDescription>
                Configure multi-step AI processing with custom prompts and model parameters
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-300">
                <li className="flex items-center"><CheckCircle className="h-4 w-4 text-green-500 mr-2" />OpenAI integration</li>
                <li className="flex items-center"><CheckCircle className="h-4 w-4 text-green-500 mr-2" />Custom workflows</li>
                <li className="flex items-center"><CheckCircle className="h-4 w-4 text-green-500 mr-2" />Step-by-step inspection</li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <Zap className="h-10 w-10 text-blue-600 mb-2" />
              <CardTitle>Real-time Processing</CardTitle>
              <CardDescription>
                Watch your data being processed live with pause, resume, and progress tracking
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-300">
                <li className="flex items-center"><CheckCircle className="h-4 w-4 text-green-500 mr-2" />Live updates</li>
                <li className="flex items-center"><CheckCircle className="h-4 w-4 text-green-500 mr-2" />Job controls</li>
                <li className="flex items-center"><CheckCircle className="h-4 w-4 text-green-500 mr-2" />Error recovery</li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <Shield className="h-10 w-10 text-blue-600 mb-2" />
              <CardTitle>Enterprise Security</CardTitle>
              <CardDescription>
                Built for Twilio with enterprise-grade security and compliance features
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-300">
                <li className="flex items-center"><CheckCircle className="h-4 w-4 text-green-500 mr-2" />Google OAuth</li>
                <li className="flex items-center"><CheckCircle className="h-4 w-4 text-green-500 mr-2" />Data encryption</li>
                <li className="flex items-center"><CheckCircle className="h-4 w-4 text-green-500 mr-2" />Audit logging</li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <Users className="h-10 w-10 text-blue-600 mb-2" />
              <CardTitle>Team Collaboration</CardTitle>
              <CardDescription>
                Share pipelines, track job history, and collaborate on RFP responses
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-300">
                <li className="flex items-center"><CheckCircle className="h-4 w-4 text-green-500 mr-2" />Shared workflows</li>
                <li className="flex items-center"><CheckCircle className="h-4 w-4 text-green-500 mr-2" />Job history</li>
                <li className="flex items-center"><CheckCircle className="h-4 w-4 text-green-500 mr-2" />Export results</li>
              </ul>
            </CardContent>
          </Card>

          <Card className="bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
            <CardHeader>
              <CardTitle className="text-blue-900 dark:text-blue-100">Ready to Start?</CardTitle>
              <CardDescription className="text-blue-700 dark:text-blue-300">
                Sign in with your Twilio Google account to begin processing your RFP files
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button 
                className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                onClick={async () => {
                  try {
                    const response = await fetch('/api/auth/google');
                    if (response.status === 503) {
                      const data = await response.json();
                      alert(`OAuth Setup Required: ${data.message}`);
                    } else {
                      window.location.href = '/api/auth/google';
                    }
                  } catch (error) {
                    window.location.href = '/api/auth/google';
                  }
                }}
              >
                Sign In Now
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Footer */}
        <footer className="text-center text-gray-500 dark:text-gray-400 border-t pt-8">
          <p>&copy; 2025 Twilio Inc. RFP Assistant - Internal Tool for AI-Powered Document Processing</p>
        </footer>
      </main>
    </div>
  );
}