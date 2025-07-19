
import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard,
  ShoppingCart, 
  Package, 
  Users, 
  BarChart3,
  Settings,
  Wifi,
  WifiOff
} from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';
import { Badge } from '@/components/ui/badge';
import { useUnifiedSyncManager } from '../../hooks/useUnifiedSyncManager';
import { cn } from '@/lib/utils';

const navigationItems = [
  { 
    id: 'dashboard', 
    label: 'Dashboard', 
    icon: LayoutDashboard, 
    path: '/app/dashboard',
    color: 'text-blue-600 dark:text-blue-400'
  },
  { 
    id: 'sales', 
    label: 'Sales', 
    icon: ShoppingCart, 
    path: '/app/sales',
    color: 'text-green-600 dark:text-green-400'
  },
  { 
    id: 'inventory', 
    label: 'Inventory', 
    icon: Package, 
    path: '/app/inventory',
    color: 'text-purple-600 dark:text-purple-400'
  },
  { 
    id: 'customers', 
    label: 'Customers', 
    icon: Users, 
    path: '/app/customers',
    color: 'text-orange-600 dark:text-orange-400'
  },
  { 
    id: 'reports', 
    label: 'Reports', 
    icon: BarChart3, 
    path: '/app/reports',
    color: 'text-pink-600 dark:text-pink-400'
  },
  { 
    id: 'settings', 
    label: 'Settings', 
    icon: Settings, 
    path: '/app/settings',
    color: 'text-gray-600 dark:text-gray-400'
  },
];

export function AppSidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { open } = useSidebar();
  const { isOnline, pendingOperations } = useUnifiedSyncManager();

  const isActive = (path: string) => location.pathname === path;
  const isCollapsed = !open;

  return (
    <Sidebar className={cn(
      "border-r border-border/50 bg-card/50 backdrop-blur-sm",
      isCollapsed ? "w-16" : "w-64"
    )}>
      <SidebarContent className="p-4">
        {/* Brand */}
        <div className={cn(
          "flex items-center gap-3 mb-8 px-2",
          isCollapsed && "justify-center"
        )}>
          <div className="w-8 h-8 bg-gradient-to-br from-purple-600 to-blue-600 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">D</span>
          </div>
          {!isCollapsed && (
            <div>
              <h1 className="font-bold text-lg text-foreground">DukaFiti</h1>
              <p className="text-xs text-muted-foreground">Business Manager</p>
            </div>
          )}
        </div>

        {/* Network Status */}
        <div className={cn(
          "flex items-center gap-2 mb-6 px-2",
          isCollapsed && "justify-center"
        )}>
          {isOnline ? (
            <Wifi className="w-4 h-4 text-green-500" />
          ) : (
            <WifiOff className="w-4 h-4 text-red-500" />
          )}
          {!isCollapsed && (
            <div className="flex items-center gap-2">
              <span className={cn(
                "text-xs font-medium",
                isOnline ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
              )}>
                {isOnline ? 'Online' : 'Offline'}
              </span>
              {pendingOperations > 0 && (
                <Badge variant="secondary" className="text-xs">
                  {pendingOperations}
                </Badge>
              )}
            </div>
          )}
        </div>

        <SidebarGroup>
          <SidebarGroupLabel className={isCollapsed ? "sr-only" : ""}>
            Navigation
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="space-y-2">
              {navigationItems.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.path);
                
                return (
                  <SidebarMenuItem key={item.id}>
                    <SidebarMenuButton 
                      asChild
                      className={cn(
                        "group relative rounded-xl transition-all duration-200 h-12",
                        active 
                          ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25" 
                          : "hover:bg-accent/50 hover:text-accent-foreground"
                      )}
                    >
                      <button
                        onClick={() => navigate(item.path)}
                        className={cn(
                          "flex items-center gap-3 w-full px-3",
                          isCollapsed && "justify-center"
                        )}
                      >
                        <Icon className={cn(
                          "w-5 h-5 transition-colors",
                          active ? "text-current" : item.color
                        )} />
                        {!isCollapsed && (
                          <span className="font-medium text-sm">
                            {item.label}
                          </span>
                        )}
                        {active && !isCollapsed && (
                          <div className="ml-auto w-2 h-2 rounded-full bg-current opacity-60" />
                        )}
                      </button>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
