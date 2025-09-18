# Combined Roles Setup Guide

## Overview
The system now supports users with multiple roles. Users like Matt can have both "tech" and "manager" roles, allowing them to switch between different dashboards.

## How to Set Up Combined Roles

### Step 1: Update Google Sheet
In your Google Sheets "Users" tab, change the role column from a single role to comma-separated roles:

**Before:**
```
Username | Password Hash | Role
Matt     | $2b$10$...    | tech
```

**After:**
```
Username | Password Hash | Role
Matt     | $2b$10$...    | tech,manager
```

### Step 2: Role Priority
The **first role** in the comma-separated list becomes the **primary role** and determines:
- Which dashboard the user sees by default after login
- The initial routing behavior

### Step 3: Available Role Combinations

#### Common Combinations:
- `tech,manager` - Tech who can also manage
- `manager,accounting` - Manager with accounting access  
- `analytics,manager` - Analytics user with manager capabilities
- `owner,manager,analytics` - Owner with full access

#### Individual Roles:
- `tech` or `technician` - Tech Dashboard only
- `manager` - Manager Dashboard only
- `accounting` - Accounting Dashboard only
- `analytics` - Analytics Dashboard only
- `owner` - Owner Dashboard (DashboardSwitcher) only
- `reception` - Reception Dashboard only

## User Experience

### Single Role Users
- Experience unchanged
- Go directly to their designated dashboard

### Multiple Role Users
- See a **Role Switcher** interface at the top
- Can switch between their available dashboards
- **Primary role** determines default dashboard
- Role buttons show which dashboard is currently active

### Example: Matt (tech,manager)
1. **Login** → Goes to Tech Dashboard (primary role)
2. **Role Switcher** → Shows "Tech Dashboard" and "Manager Dashboard" buttons
3. **Click "Manager Dashboard"** → Switches to full Manager Dashboard
4. **Click "Tech Dashboard"** → Switches back to Tech Dashboard

## Technical Details

### Backend Changes
- ✅ Parses comma-separated roles from Google Sheet
- ✅ Returns `roles` array and `primaryRole` in login response
- ✅ JWT token includes both `roles` and `primaryRole`
- ✅ Middleware supports checking multiple roles

### Frontend Changes
- ✅ `hasRole()` utility function for role checking
- ✅ `RoleSwitcher` component for users with multiple roles
- ✅ Updated routing to handle multiple roles
- ✅ Backward compatibility with single roles

### Role Switcher Features
- 🎨 Clean, modern interface
- 🔄 Seamless switching between dashboards
- 👤 Shows user name and role context
- 🎯 Highlights active dashboard
- 📱 Responsive design

## Testing

### Test Cases:
1. **Single role user** (e.g., `tech`) → Should work as before
2. **Multiple role user** (e.g., `tech,manager`) → Should see role switcher
3. **Role switching** → Should seamlessly switch between dashboards
4. **Permissions** → Each dashboard should have full functionality

### Recommended Test:
1. Update Matt's role to `tech,manager` in Google Sheet
2. Login as Matt
3. Verify he sees Tech Dashboard by default
4. Verify role switcher appears with both options
5. Switch to Manager Dashboard and test functionality
6. Switch back to Tech Dashboard

## Backward Compatibility
- ✅ Existing single-role users continue to work
- ✅ Existing permissions and routing preserved
- ✅ No changes needed for users who don't need multiple roles

## Future Enhancements
- Could add role-specific permissions within dashboards
- Could add user preferences for default role
- Could add audit logging for role switches
