ALTER TABLE orders ADD COLUMN service_details TEXT NOT NULL DEFAULT '{"occasion":"","guestCount":null,"dietary":"","packaging":""}';
