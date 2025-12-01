# SalesMasters Google Sheet Setup Guide

## Overview
The SalesMasters tab in your Google Sheet will combine data from your four Excel tables (New Sales, Used Sales, Service, and Rental Rates) into a single normalized format.

## Required Column Structure

Create a tab called **"SalesMasters"** in your Google Sheet with the following columns:

| Column | Header | Description | Example |
|--------|--------|-------------|---------|
| A | Brand | Manufacturer/brand name | WPG, SmartLift, SpyderCrane |
| B | Machine/Item | Model or item name | P1 Glass, MRT4, 309, PC094 |
| C | Brand & Machine | Combined identifier (optional, for reference) | P1 Glass, WPG |
| D | Sale Price | Price for new sales | 6009.08, 7929.85, 32430 |
| E | Commission % New | Commission percentage for new sales | 2, 3 |
| F | Commission % Used | Commission percentage for used sales | 3 |
| G | Commission Service | Flat commission amount for service (not percentage) | 15, 25 |
| H | Rental Daily Rate | Daily rental rate | 215, 300, 475, 695 |
| I | Rental Weekly Rate | Weekly rental rate | 645, 900, 1325, 1750 |
| J | Rental Monthly Rate | Monthly rental rate | 1935, 2700, 3725, 5200 |
| K | Commission Flat Rate Sales | Flat dollar amount for sales (overrides percentage if set) | 500 (for SpyderCrane) |

## How to Populate the Sheet

### Step 1: Create the Header Row
In row 1 of the SalesMasters tab, add these headers:
```
Brand | Machine/Item | Brand & Machine | Sale Price | Commission % New | Commission % Used | Commission Service | Rental Daily Rate | Rental Weekly Rate | Rental Monthly Rate | Commission Flat Rate Sales
```

### Step 2: Copy Data from Your Excel Tables

For each unique machine (Brand + Machine/Item combination):

1. **From New Sales Table:**
   - Copy Brand → Column A
   - Copy Sale Item → Column B
   - Copy Brand & Machine → Column C
   - Copy Sale Price → Column D
   - Copy Commission % → Column E (remove % sign, just the number)

2. **From Used Sales Table:**
   - Match by Brand + Machine/Item
   - Copy Commission % → Column F (remove % sign, just the number)

3. **From Service Table:**
   - Match by Brand & Machine (may be truncated in your Excel)
   - Copy Commission Total → Column G (this is a flat amount, not a percentage)

4. **From Rental Rates Table:**
   - Match by Brand + Rental Item
   - Copy Daily Rate → Column H
   - Copy Weekly Rate → Column I
   - Copy Monthly Rate → Column J

5. **For Flat Rate Sales Commissions (e.g., SpyderCrane):**
   - Enter flat dollar amount in Column K
   - This will override percentage-based commission calculation
   - Example: Enter `500` for all SpyderCrane machines

### Step 3: Handle Missing Data

- If a machine doesn't have data for a specific transaction type, leave that cell empty
- The system will handle missing values gracefully
- For example, if a machine is only sold (not rented), leave rental columns empty

### Example Row

Based on your data, a complete row might look like:

| Brand | Machine/Item | Brand & Machine | Sale Price | Commission % New | Commission % Used | Commission Service | Rental Daily Rate | Rental Weekly Rate | Rental Monthly Rate |
|-------|-------------|-----------------|------------|------------------|-------------------|-------------------|-------------------|-------------------|---------------------|
| WPG | P1 Glass | P1 Glass, WPG | 6009.08 | 2 | 3 | 15 | 215 | 645 | 1935 | |
| SmartLift | 309 | 309, SmartLift | 32430 | 3 | 3 | 25 | 475 | 1325 | 3725 | |
| SpyderCrane | PC094 | PC094, SpyderCrane | 74900 | 3 | 3 | 25 | 695 | 1750 | 5200 | 500 |

## Notes

- **Commission Service** is a flat dollar amount (not a percentage) - enter the number directly (e.g., 15, 25)
- **Commission Flat Rate Sales** (Column K) is a flat dollar amount that overrides percentage-based commission - enter the number directly (e.g., 500 for SpyderCrane). Leave empty if using percentage-based commission.
- **Commission percentages** should be entered as numbers without the % sign (e.g., 2, 3, not 2%, 3%)
- **Sale Price** and **Rental Rates** should be entered as numbers without currency symbols
- The system will automatically populate commission percentages and sale prices when a salesman selects a machine in the dashboard
- If a machine has a flat rate commission (Column K), it will be used instead of calculating from percentage

## Testing

After setting up the SalesMasters tab:

1. Log in as a user with "sales" role
2. Go to Sales Dashboard
3. Click "Add Transaction"
4. Select a Brand and Machine/Item
5. Verify that:
   - Sale Price populates automatically (for new/used sales)
   - Commission % populates automatically based on transaction type
   - Service commission amount populates automatically (for service transactions)

