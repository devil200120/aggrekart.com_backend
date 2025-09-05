# Admin Users Import Guide

## Overview
This guide explains how to import admin users directly into your MongoDB database using the provided JSON file.

## Files Included
- `admin-users-import.json` - Contains 3 pre-configured admin users ready for import

## Admin Users Details

### 1. Super Admin (ADMIN001)
- **Email**: admin@aggrekart.com
- **Phone**: 9876543210
- **Role**: admin
- **Access Level**: Full system access
- **Default Password**: `admin123` (hashed in JSON)

### 2. Operations Manager (ADMIN002)
- **Email**: operations@aggrekart.com
- **Phone**: 9876543211
- **Role**: admin
- **Access Level**: Operations management
- **Default Password**: `admin123` (hashed in JSON)

### 3. Support Manager (ADMIN003)
- **Email**: support@aggrekart.com
- **Phone**: 9876543212
- **Role**: admin
- **Access Level**: Support and customer management
- **Default Password**: `admin123` (hashed in JSON)

## Import Methods

### Method 1: Using MongoDB Compass (Recommended for GUI users)

1. **Open MongoDB Compass** and connect to your database
2. **Navigate** to your database (e.g., `aggrekart`)
3. **Click** on the `users` collection
4. **Click** the "ADD DATA" button
5. **Select** "Import JSON or CSV file"
6. **Choose** the `admin-users-import.json` file
7. **Select** "JSON" as file type
8. **Click** "Import" to add the users

### Method 2: Using MongoDB Shell (CLI)

1. **Open Terminal/Command Prompt**
2. **Navigate** to the directory containing the JSON file:
   ```bash
   cd "C:\Users\KIIT0001\Desktop\builder_website using mern"
   ```
3. **Connect** to your MongoDB instance:
   ```bash
   mongo "your-mongodb-connection-string"
   ```
4. **Switch** to your database:
   ```javascript
   use aggrekart
   ```
5. **Load and insert** the JSON data:
   ```javascript
   load('admin-users-import.json')
   ```
   Or use mongoimport:
   ```bash
   mongoimport --uri "your-mongodb-connection-string" --collection users --file admin-users-import.json --jsonArray
   ```

### Method 3: Using mongoimport (Command Line Tool)

1. **Open Terminal/Command Prompt**
2. **Run the import command**:
   ```bash
   mongoimport --uri "your-mongodb-connection-string" --db aggrekart --collection users --file "C:\Users\KIIT0001\Desktop\builder_website using mern\admin-users-import.json" --jsonArray
   ```

### Method 4: For Render/Cloud MongoDB

If using MongoDB Atlas or similar cloud service:

1. **Get your connection string** from your MongoDB provider
2. **Use mongoimport** with the cloud connection:
   ```bash
   mongoimport --uri "mongodb+srv://username:password@cluster.mongodb.net/aggrekart" --collection users --file admin-users-import.json --jsonArray
   ```

## Post-Import Verification

### 1. Verify Import Success
Connect to your MongoDB and run:
```javascript
db.users.find({"role": "admin"}).count()
// Should return 3 (or more if you already had admin users)
```

### 2. Check Specific Admin Users
```javascript
db.users.find({"role": "admin"}, {"name": 1, "email": 1, "customerId": 1})
```

### 3. Verify Login Credentials
Try logging in through your admin panel using:
- **Email**: `admin@aggrekart.com`
- **Password**: `admin123`

## Customizing Admin Users

### To modify the JSON before import:

1. **Open** `admin-users-import.json` in any text editor
2. **Update** the following fields as needed:
   - `name`: Admin's full name
   - `email`: Admin's email address
   - `phoneNumber`: Admin's phone number
   - `customerId`: Unique admin ID (keep format ADMIN001, ADMIN002, etc.)
   - `addresses`: Update location details
   - `aggreCoins`: Set initial coin balance

### To change default passwords:

1. **Generate** new bcrypt hash for your desired password
2. **Replace** the `password` field value
3. Or **set** `password` to plain text and let your backend hash it on first login

## Password Information

The default password `admin123` is pre-hashed using bcrypt with salt rounds 12.

**To generate a new password hash:**
```javascript
const bcrypt = require('bcrypt');
const saltRounds = 12;
const plainPassword = 'yournewpassword';
bcrypt.hash(plainPassword, saltRounds, (err, hash) => {
    console.log(hash); // Use this hash in the JSON file
});
```

## Security Best Practices

1. **Change default passwords** immediately after import
2. **Use strong passwords** for production environments
3. **Limit admin access** to necessary personnel only
4. **Regular password rotation** for admin accounts
5. **Monitor admin activity** through your application logs

## Troubleshooting

### Common Import Errors:

1. **Duplicate Key Error**: 
   - Admin user with same email/customerId already exists
   - Solution: Check existing users or modify the customerId/email

2. **Validation Error**: 
   - Required fields are missing
   - Solution: Ensure all required fields are present in JSON

3. **Connection Error**: 
   - Database connection issues
   - Solution: Verify connection string and network access

### Checking for Existing Admins:
```javascript
db.users.find({"role": "admin"}, {"email": 1, "customerId": 1})
```

### Removing Imported Admins (if needed):
```javascript
db.users.deleteMany({"customerId": {$in: ["ADMIN001", "ADMIN002", "ADMIN003"]}})
```

## Support

If you encounter issues during import:
1. Check MongoDB connection
2. Verify JSON file format
3. Ensure proper permissions for database operations
4. Check server logs for detailed error messages

---

**Note**: Always backup your database before performing bulk imports in production environments.