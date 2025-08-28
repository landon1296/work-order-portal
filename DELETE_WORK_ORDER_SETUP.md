# Delete Work Order Functionality Setup

## Overview
The delete work order functionality allows managers and accounting users to permanently delete work orders from the database. This includes all related data such as time entries, line items, and the work order itself.

## Security Features
- **Password Protection**: A password is required to delete any work order
- **Role-Based Access**: Only managers and accounting users can see the delete button
- **Confirmation Modal**: A detailed warning modal appears before deletion
- **Transaction Safety**: All deletions are wrapped in database transactions

## Setup Instructions

### 1. Backend Environment Variable
Add the following environment variable to your backend `.env` file:

```bash
DELETE_WORK_ORDER_PASSWORD=your_secure_password_here
```

**Default Password**: If no environment variable is set, the default password is `delete123`

### 2. Database Tables Affected
The delete operation removes data from the following tables:
- `workorders` - The main work order record
- `time_entries` - All time entries for the work order
- `line_items` - All line items for the work order
- `photos` - Any photos associated with the work order (if photos table exists)

### 3. API Endpoint
The delete endpoint is available at:
```
DELETE /workorders/:workOrderNo
```

**Request Body:**
```json
{
  "password": "your_delete_password"
}
```

**Response:**
```json
{
  "message": "Work order 607 and all related data have been permanently deleted.",
  "deletedWorkOrderNo": "607"
}
```

## Usage

### For Managers
1. Navigate to the Manager Dashboard
2. Find the work order you want to delete
3. Click the red "Delete" button in the Actions column
4. Enter the deletion password in the modal
5. Confirm the deletion

### For Accounting Users
1. Navigate to the Accounting Dashboard
2. Find the work order you want to delete
3. Click the red "Delete" button in the Actions column
4. Enter the deletion password in the modal
5. Confirm the deletion

## Safety Features

### Warning Modal
The delete modal shows:
- Clear warning that the action cannot be undone
- List of all data that will be deleted
- Password input field
- Cancel and Delete buttons

### Database Transaction
All deletions are wrapped in a database transaction to ensure:
- Either all related data is deleted, or nothing is deleted
- No partial deletions that could leave orphaned data
- Rollback capability if any deletion fails

### Error Handling
- Invalid password returns 401 Unauthorized
- Work order not found returns 404 Not Found
- Database errors return 500 Internal Server Error
- All errors include descriptive messages

## Important Notes

⚠️ **WARNING**: This is a permanent deletion. Once a work order is deleted, it cannot be recovered.

- The deletion is based on the work order number, not the database ID
- All related records (time entries, line items, etc.) are automatically deleted
- The operation is logged in the server console for audit purposes
- Consider backing up your database before using this feature

## Customization

### Changing the Password
To change the deletion password:
1. Update the `DELETE_WORK_ORDER_PASSWORD` environment variable
2. Restart the backend server
3. Inform all authorized users of the new password

### Adding More Security
You can enhance security by:
- Adding IP restrictions
- Implementing rate limiting
- Adding audit logging to a separate table
- Requiring additional confirmation steps

## Troubleshooting

### Common Issues

1. **"Incorrect password" error**
   - Verify the `DELETE_WORK_ORDER_PASSWORD` environment variable is set correctly
   - Check that the backend server has been restarted after setting the variable

2. **"Work order not found" error**
   - Verify the work order number exists in the database
   - Check that the work order hasn't already been deleted

3. **"Failed to delete work order" error**
   - Check the server logs for detailed error information
   - Verify database connectivity
   - Ensure the user has proper database permissions
