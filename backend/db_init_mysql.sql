-- GigGo MySQL bootstrap script
-- Run this in MySQL Workbench before starting the backend.

CREATE DATABASE IF NOT EXISTS giggo
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

CREATE USER IF NOT EXISTS 'giggo'@'localhost' IDENTIFIED BY 'root';

GRANT ALL PRIVILEGES ON giggo.* TO 'giggo'@'localhost';
FLUSH PRIVILEGES;
