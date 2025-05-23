-- Create a new SQL authentication user
CREATE USER railway_app WITH PASSWORD = 'SK2050885Ronde!';

-- Grant necessary permissions
ALTER ROLE db_datareader ADD MEMBER railway_app;
ALTER ROLE db_datawriter ADD MEMBER railway_app;
