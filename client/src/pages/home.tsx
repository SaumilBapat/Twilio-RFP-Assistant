import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { FileSpreadsheet, Bot, TrendingUp, Clock } from "lucide-react";
import { Link } from "wouter";

export default function Home() {
  const { user } = useAuth();

  const { data: stats } = useQuery({
    queryKey: ["/api/user/stats"],
  });

  const { data: jobs } = useQuery({
    queryKey: ["/api/jobs"],
  });

  const recentJobs = Array.isArray(jobs) ? jobs.slice(0, 5) : [];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-3">
              <Bot className="h-8 w-8 text-blue-600" />
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">RFP Assistant</h1>
            </div>
            
            <div className="flex items-center space-x-4">
              <span className="text-gray-700 dark:text-gray-300">
                Welcome, {(user as any)?.firstName || (user as any)?.email || 'User'}
              </span>
              <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white font-medium">
                {(user as any)?.firstName?.[0] || (user as any)?.email?.[0] || 'U'}
              </div>
              <Button 
                variant="outline"
                onClick={() => window.location.href = '/api/logout'}
              >
                Sign Out
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Jobs</CardTitle>
              <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{(stats as any)?.totalJobs || 0}</div>
              <p className="text-xs text-muted-foreground">All time processing</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Jobs</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{(stats as any)?.activeJobs || 0}</div>
              <p className="text-xs text-muted-foreground">Currently processing</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Completed Today</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{(stats as any)?.completedToday || 0}</div>
              <p className="text-xs text-muted-foreground">Finished processing</p>
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
              <CardDescription>
                Start processing your RFP and security questionnaire files
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Link href="/dashboard">
                <Button className="w-full" size="lg">
                  <FileSpreadsheet className="mr-2 h-5 w-5" />
                  Upload New CSV File
                </Button>
              </Link>
              <Link href="/dashboard?tab=pipelines">
                <Button variant="outline" className="w-full" size="lg">
                  <Bot className="mr-2 h-5 w-5" />
                  Manage AI Pipelines
                </Button>
              </Link>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Getting Started</CardTitle>
              <CardDescription>
                New to RFP Assistant? Here's how to get started
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-start space-x-3">
                <div className="flex-shrink-0 w-6 h-6 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center text-xs font-medium text-blue-600 dark:text-blue-400">
                  1
                </div>
                <div>
                  <p className="text-sm font-medium">Upload your CSV file</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Files up to 25MB with 5,000 rows supported
                  </p>
                </div>
              </div>
              <div className="flex items-start space-x-3">
                <div className="flex-shrink-0 w-6 h-6 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center text-xs font-medium text-blue-600 dark:text-blue-400">
                  2
                </div>
                <div>
                  <p className="text-sm font-medium">Select an AI pipeline</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Use the default RFP pipeline or create custom ones
                  </p>
                </div>
              </div>
              <div className="flex items-start space-x-3">
                <div className="flex-shrink-0 w-6 h-6 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center text-xs font-medium text-blue-600 dark:text-blue-400">
                  3
                </div>
                <div>
                  <p className="text-sm font-medium">Watch real-time processing</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Track progress and view detailed step execution
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Recent Jobs */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Jobs</CardTitle>
            <CardDescription>
              Your latest CSV processing jobs
            </CardDescription>
          </CardHeader>
          <CardContent>
            {recentJobs.length === 0 ? (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                <FileSpreadsheet className="mx-auto h-12 w-12 mb-4 opacity-50" />
                <p>No jobs yet. Upload your first CSV file to get started!</p>
              </div>
            ) : (
              <div className="space-y-4">
                {recentJobs.map((job: any) => (
                  <div key={job.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center space-x-4">
                      <FileSpreadsheet className="h-8 w-8 text-blue-600" />
                      <div>
                        <h3 className="font-medium">{job.name}</h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          {job.totalRows} rows • {new Date(job.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-4">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        job.status === 'completed' ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' :
                        job.status === 'in_progress' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' :
                        job.status === 'error' ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300' :
                        'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
                      }`}>
                        {job.status.replace('_', ' ')}
                      </span>
                      <Link href={`/spreadsheet/${job.id}`}>
                        <Button variant="outline" size="sm">
                          View
                        </Button>
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}