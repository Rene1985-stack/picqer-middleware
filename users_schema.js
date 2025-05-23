/**
 * Database schema for Picqer users
 * Based on the Picqer API documentation: https://picqer.com/en/api/users
 */

// SQL script to create Users table
const createUsersTableSQL = `
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'Users')
BEGIN
    CREATE TABLE Users (
        id INT IDENTITY(1,1) PRIMARY KEY,
        iduser INT NOT NULL,
        idpacking_station INT NULL,
        username NVARCHAR(100) NOT NULL,
        firstname NVARCHAR(100) NULL,
        lastname NVARCHAR(100) NULL,
        first_name NVARCHAR(100) NULL,
        last_name NVARCHAR(100) NULL,
        emailaddress NVARCHAR(255) NULL,
        language NVARCHAR(10) NULL,
        admin BIT NOT NULL DEFAULT 0,
        active BIT NOT NULL DEFAULT 1,
        last_login_at DATETIME NULL,
        created_at DATETIME NULL,
        updated_at DATETIME NULL,
        last_sync_date DATETIME NOT NULL DEFAULT GETDATE(),
        
        -- Create indexes for better performance
        INDEX IX_Users_iduser (iduser),
        INDEX IX_Users_username (username),
        INDEX IX_Users_active (active)
    );
END
`;

// SQL script to create UserRights table for user permissions
const createUserRightsTableSQL = `
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'UserRights')
BEGIN
    CREATE TABLE UserRights (
        id INT IDENTITY(1,1) PRIMARY KEY,
        iduser INT NOT NULL,
        right_name NVARCHAR(100) NOT NULL,
        granted BIT NOT NULL DEFAULT 0,
        last_sync_date DATETIME NOT NULL DEFAULT GETDATE(),
        
        -- Create indexes for better performance
        INDEX IX_UserRights_iduser (iduser),
        INDEX IX_UserRights_right_name (right_name),
        CONSTRAINT UC_UserRights_user_right UNIQUE (iduser, right_name)
    );
END
`;

module.exports = {
    createUsersTableSQL,
    createUserRightsTableSQL
};
