import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Bell, Settings, Upload, ChevronDown, User, Cog } from "lucide-react";
import { useLocation } from "wouter";
import { StatsCards } from "@/components/stats-cards";
import { JobTable } from "@/components/job-table";
import { UploadModal } from "@/components/upload-modal";

import { SystemHealth } from "@/components/system-health";
import { useWebSocket } from "@/hooks/use-websocket";
import { useAuth } from "@/hooks/useAuth";
import { isUnauthorizedError } from "@/lib/authUtils";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";

export default function Dashboard() {
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [, setLocation] = useLocation();
  const { user, isAuthenticated, isLoading } = useAuth();
  const { toast } = useToast();
  const { lastMessage } = useWebSocket((user as any)?.id || null);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      toast({
        title: "Unauthorized",
        description: "You are logged out. Logging in again...",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/api/auth/google";
      }, 500);
      return;
    }
  }, [isAuthenticated, isLoading, toast]);

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['/api/user/stats'],
    enabled: isAuthenticated,
    retry: (failureCount, error) => {
      if (isUnauthorizedError(error as Error)) {
        return false;
      }
      return failureCount < 3;
    }
  });

  const { data: jobs = [], isLoading: jobsLoading, refetch: refetchJobs } = useQuery({
    queryKey: ['/api/jobs'],
    enabled: isAuthenticated,
    retry: (failureCount, error) => {
      if (isUnauthorizedError(error as Error)) {
        return false;
      }
      return failureCount < 3;
    }
  });



  // Handle WebSocket messages
  useEffect(() => {
    if (lastMessage) {
      console.log('🔄 [Dashboard] Processing WebSocket message:', lastMessage);
      switch (lastMessage.event) {
        case 'jobStarted':
        case 'jobCompleted':
        case 'jobPaused':
        case 'rowProcessed':
          console.log('🔄 [Dashboard] Invalidating queries due to job update');
          queryClient.invalidateQueries({ queryKey: ['/api/jobs'] });
          queryClient.invalidateQueries({ queryKey: ['/api/user/stats'] });
          break;
      }
    }
  }, [lastMessage]);

  const handleJobUpdate = () => {
    refetchJobs();
    queryClient.invalidateQueries({ queryKey: ['/api/user/stats'] });
  };

  const handleUploadComplete = () => {
    refetchJobs();
    queryClient.invalidateQueries({ queryKey: ['/api/user/stats'] });
  };



  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation Header */}
      <header className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Logo and Brand */}
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-primary-500 rounded-lg flex items-center justify-center">
                  <i className="fas fa-robot text-white text-sm"></i>
                </div>
                <div>
                  <h1 className="text-xl font-semibold text-gray-900">RFP Assistant</h1>
                  <p className="text-xs text-gray-500">AI-Powered Response Platform</p>
                </div>
              </div>
            </div>

            {/* User Profile and Actions */}
            <div className="flex items-center space-x-4">
              {/* Notifications */}
              <Button variant="ghost" size="sm" className="relative">
                <Bell className="h-5 w-5 text-gray-400" />
                <span className="absolute -top-1 -right-1 w-3 h-3 bg-error-500 rounded-full"></span>
              </Button>
              
              {/* User Profile */}
              <div className="flex items-center space-x-3 pl-4 border-l border-gray-200">
                <div className="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center">
                  <User className="h-4 w-4 text-gray-600" />
                </div>
                <div className="hidden md:block">
                  <p className="text-sm font-medium text-gray-900">{(user as any)?.name || 'Sarah Chen'}</p>
                  <p className="text-xs text-gray-500">{(user as any)?.email || 'sarah.chen@twilio.com'}</p>
                </div>
                <Button variant="ghost" size="sm">
                  <ChevronDown className="h-4 w-4 text-gray-400" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Dashboard Header */}
        <div className="mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Dashboard</h2>
              <p className="text-gray-600 mt-1">Manage your RFP processing jobs and AI pipelines</p>
            </div>
            <div className="mt-4 sm:mt-0 flex space-x-3">
              <Button variant="outline" onClick={() => setLocation('/pipeline')}>
                <Cog className="mr-2 h-4 w-4" />
                Edit AI Pipeline
              </Button>
              <Button onClick={() => setUploadModalOpen(true)}>
                <Upload className="mr-2 h-4 w-4" />
                Upload CSV
              </Button>
            </div>
          </div>

          {/* Quick Stats */}
          {statsLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 animate-pulse">
                  <div className="h-4 bg-gray-200 rounded w-1/2 mb-2"></div>
                  <div className="h-8 bg-gray-200 rounded w-1/3"></div>
                </div>
              ))}
            </div>
          ) : (
            <StatsCards stats={stats as any || { totalJobs: 0, activeJobs: 0, completedToday: 0 }} />
          )}
        </div>

        {/* Jobs Table */}
        {jobsLoading ? (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8">
            <div className="animate-pulse space-y-4">
              <div className="h-4 bg-gray-200 rounded w-1/4"></div>
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="h-12 bg-gray-200 rounded"></div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <JobTable jobs={jobs as any} onJobUpdate={handleJobUpdate} />
        )}

        {/* System Health Panel */}
        <div className="mt-8">
          <SystemHealth />
        </div>
      </div>

      {/* Upload Modal */}
      <UploadModal
        open={uploadModalOpen}
        onOpenChange={setUploadModalOpen}
        onUploadComplete={handleUploadComplete}
      />
    </div>
  );
}
