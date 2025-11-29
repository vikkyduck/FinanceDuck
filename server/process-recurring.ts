import { storage } from "./storage";

async function main() {
  console.log("[Recurring] Processing due recurring invoices...");
  
  try {
    const result = await storage.processAllDueRecurringInvoices();
    
    if (result.created > 0) {
      console.log(`[Recurring] Created ${result.created} draft invoice(s)`);
    } else {
      console.log("[Recurring] No invoices due for creation");
    }
    
    if (result.errors.length > 0) {
      console.error("[Recurring] Errors:", result.errors);
      process.exit(1);
    }
    
    process.exit(0);
  } catch (error) {
    console.error("[Recurring] Failed:", error);
    process.exit(1);
  }
}

main();
