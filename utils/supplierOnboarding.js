const Supplier = require('../models/Supplier');
const User = require('../models/User');
const { sendEmail, sendSMS } = require('./notifications');
const { getGSTDetails } = require('./gstAPI');

// Supplier onboarding workflow
class SupplierOnboarding {
  
  // Step 1: Initial registration
  static async registerSupplier(userData, supplierData) {
    try {
      // Validate GST number
      const gstDetails = await getGSTDetails(supplierData.gstNumber);
      
      // Create supplier with pending status
      const supplier = new Supplier({
        ...supplierData,
        gstVerificationDetails: gstDetails,
        onboardingStep: 'registration_complete',
        isApproved: false,
        isActive: false
      });

      await supplier.save();

      // Send welcome email with next steps
      await this.sendWelcomeEmail(supplier);

      return {
        success: true,
        supplier,
        nextStep: 'document_upload'
      };

    } catch (error) {
      throw new Error(`Registration failed: ${error.message}`);
    }
  }

  // Step 2: Document verification
  static async verifyDocuments(supplierId, documents) {
    try {
      const supplier = await Supplier.findById(supplierId);
      if (!supplier) {
        throw new Error('Supplier not found');
      }

      // Update documents
      supplier.documentsUploaded = documents.map(doc => ({
        type: doc.type,
        url: doc.url,
        originalName: doc.originalName,
        isVerified: false // Will be verified by admin
      }));

      supplier.onboardingStep = 'documents_uploaded';
      await supplier.save();

      // Notify admin for document review
      await this.notifyAdminForReview(supplier);

      return {
        success: true,
        message: 'Documents uploaded successfully',
        nextStep: 'admin_review'
      };

    } catch (error) {
      throw new Error(`Document upload failed: ${error.message}`);
    }
  }

  // Step 3: Admin review and approval
  static async approveSupplier(supplierId, adminId, commissionRate = 5) {
    try {
      const supplier = await Supplier.findById(supplierId).populate('user');
      if (!supplier) {
        throw new Error('Supplier not found');
      }

      // Update approval status
      supplier.isApproved = true;
      supplier.isActive = true;
      supplier.approvedBy = adminId;
      supplier.approvedAt = new Date();
      supplier.commissionRate = commissionRate;
      supplier.onboardingStep = 'approved';

      await supplier.save();

      // Send approval notifications
      await this.sendApprovalNotification(supplier);
      
      // Send onboarding completion guide
      await this.sendOnboardingGuide(supplier);

      return {
        success: true,
        message: 'Supplier approved successfully',
        supplier
      };

    } catch (error) {
      throw new Error(`Approval failed: ${error.message}`);
    }
  }

  // Step 4: Product setup assistance
  static async setupProductCatalog(supplierId, categories) {
    try {
      const supplier = await Supplier.findById(supplierId);
      if (!supplier) {
        throw new Error('Supplier not found');
      }

      // Update categories
      supplier.categories = categories;
      supplier.onboardingStep = 'catalog_setup';
      await supplier.save();

      // Send product setup guide
      await this.sendProductSetupGuide(supplier, categories);

      return {
        success: true,
        message: 'Product categories configured',
        nextStep: 'first_products'
      };

    } catch (error) {
      throw new Error(`Catalog setup failed: ${error.message}`);
    }
  }

  // Utility methods
  static async sendWelcomeEmail(supplier) {
    const subject = 'Welcome to Aggrekart - Supplier Registration Received';
    const content = `
      Dear ${supplier.tradeOwnerName},

      Thank you for registering as a supplier with Aggrekart!

      Your application has been received and is being reviewed. Here's what happens next:

      1. Document Verification (1-2 business days)
      2. Profile Review (1-2 business days)
      3. Account Approval & Activation

      Your Supplier ID: ${supplier.supplierId}

      We'll keep you updated on the status of your application.

      Best regards,
      Aggrekart Team
    `;

    await sendEmail(supplier.email, subject, content);
  }

  static async notifyAdminForReview(supplier) {
    // In a real application, this would send notifications to admin users
    console.log(`New supplier pending review: ${supplier.companyName} (${supplier.supplierId})`);
    
    // Could also send email to admin team
    const adminEmail = process.env.ADMIN_EMAIL;
    if (adminEmail) {
      await sendEmail(
        adminEmail,
        'New Supplier Registration - Review Required',
        `
        A new supplier has completed registration and requires review:

        Company: ${supplier.companyName}
        Supplier ID: ${supplier.supplierId}
        GST Number: ${supplier.gstNumber}
        Contact: ${supplier.contactPersonName} (${supplier.contactPersonNumber})

        Please review and approve/reject in the admin panel.
        `
      );
    }
  }

  static async sendApprovalNotification(supplier) {
    // Email notification
    const subject = 'Supplier Account Approved - Welcome to Aggrekart!';
    const content = `
      Dear ${supplier.tradeOwnerName},

      Congratulations! Your supplier account has been approved.

      Account Details:
      - Supplier ID: ${supplier.supplierId}
      - Company: ${supplier.companyName}
      - Commission Rate: ${supplier.commissionRate}%

      You can now:
      ✓ Add products to your catalog
      ✓ Receive and manage orders
      ✓ Track sales and analytics
      ✓ Update pricing and inventory

      Login to your supplier dashboard to get started.

      Need help? Our onboarding team is here to assist you.

      Best regards,
      Aggrekart Team
    `;

    await sendEmail(supplier.email, subject, content);

    // SMS notification
    await sendSMS(
      supplier.contactPersonNumber,
      `Congratulations! Your Aggrekart supplier account (${supplier.supplierId}) has been approved. Login to start selling construction materials.`
    );
  }

  static async sendOnboardingGuide(supplier) {
    const subject = 'Getting Started Guide - Aggrekart Supplier';
    const content = `
      Dear ${supplier.tradeOwnerName},

      Welcome to the Aggrekart family! Here's your step-by-step guide to get started:

      📋 STEP 1: Complete Your Profile
      - Add transport rates for different distance ranges
      - Set up your service areas (pincodes you deliver to)
      - Configure working hours and days

      🛍️ STEP 2: Add Your Products
      - Choose your product categories
      - Add product details (name, pricing, minimum quantities)
      - Upload high-quality product images
      - Set competitive prices

      📊 STEP 3: Optimize Your Listings
      - Write clear product descriptions
      - Set appropriate minimum order quantities
      - Configure delivery times accurately

      🚚 STEP 4: Manage Orders
      - Check for new orders regularly
      - Update order status promptly
      - Maintain good customer communication

      💡 Tips for Success:
      - Keep your inventory updated
      - Respond to customer queries quickly
      - Maintain competitive pricing
      - Ensure timely deliveries

      Login to your dashboard: [Dashboard Link]

      Need assistance? Contact our support team at support@aggrekart.com

      Best regards,
      Aggrekart Team
    `;

    await sendEmail(supplier.email, subject, content);
  }

  static async sendProductSetupGuide(supplier, categories) {
    const categoryGuides = {
      aggregate: 'Dust, 10MM/20MM/40MM Metal, GSB, WMM, M.sand',
      sand: 'River sand (Plastering), River sand',
      tmt_steel: 'FE-415, FE-500, FE-550, FE-600 with various diameters',
      bricks_blocks: 'Red Bricks, Fly Ash Bricks, Concrete Blocks, AAC Blocks',
      cement: 'OPC (33/43/53 Grade), PPC'
    };

    const selectedCategories = categories.map(cat => 
      `${cat}: ${categoryGuides[cat] || 'Various products'}`
    ).join('\n');

    const subject = 'Product Setup Guide - Your Selected Categories';
    const content = `
      Dear ${supplier.tradeOwnerName},

      Great! You've selected the following product categories:

      ${selectedCategories}

      For each category, make sure to:

      📝 Provide Accurate Information:
      - Exact product specifications
      - Current market prices
      - Minimum order quantities
      - Estimated delivery times

      📸 Upload Quality Images:
      - Clear, high-resolution photos
      - Multiple angles if needed
      - Proper lighting and background

      💰 Competitive Pricing:
      - Research local market rates
      - Include all costs (material + transport)
      - Update prices regularly

      📦 Inventory Management:
      - Keep stock quantities updated
      - Set low-stock alerts
      - Mark unavailable items as inactive

      Ready to add your first product? Login to your dashboard and click "Add Product".

      Best regards,
      Aggrekart Team
    `;

    await sendEmail(supplier.email, subject, content);
  }

  // Get onboarding status
  static async getOnboardingStatus(supplierId) {
    try {
      const supplier = await Supplier.findById(supplierId).populate('user');
      if (!supplier) {
        throw new Error('Supplier not found');
      }

      const status = {
        currentStep: supplier.onboardingStep || 'registration_pending',
        isApproved: supplier.isApproved,
        isActive: supplier.isActive,
        documentsUploaded: supplier.documentsUploaded.length > 0,
        profileComplete: this.isProfileComplete(supplier),
        productsAdded: false, // Would check Product model
        completionPercentage: 0
      };

      // Calculate completion percentage
      let completed = 0;
      const totalSteps = 5;

      if (supplier.onboardingStep === 'registration_complete') completed++;
      if (status.documentsUploaded) completed++;
      if (supplier.isApproved) completed++;
      if (status.profileComplete) completed++;
      if (status.productsAdded) completed++;

      status.completionPercentage = Math.round((completed / totalSteps) * 100);

      return status;

    } catch (error) {
      throw new Error(`Failed to get onboarding status: ${error.message}`);
    }
  }

  static isProfileComplete(supplier) {
    return !!(
      supplier.transportRates.upTo5km.costPerKm &&
      supplier.transportRates.upTo10km.costPerKm &&
      supplier.transportRates.upTo20km.costPerKm &&
      supplier.transportRates.above20km.costPerKm &&
      supplier.categories.length > 0
    );
  }

  // Send reminder emails for incomplete onboarding
  static async sendOnboardingReminders() {
    try {
      const incompleteSuppliers = await Supplier.find({
        isApproved: false,
        rejectedAt: { $exists: false },
        createdAt: { 
          $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
          $lte: new Date(Date.now() - 24 * 60 * 60 * 1000) // More than 1 day ago
        }
      });

      for (const supplier of incompleteSuppliers) {
        const status = await this.getOnboardingStatus(supplier._id);
        
        if (status.completionPercentage < 100) {
          await this.sendReminderEmail(supplier, status);
        }
      }

      return {
        success: true,
        remindersSent: incompleteSuppliers.length
      };

    } catch (error) {
      console.error('Failed to send onboarding reminders:', error);
      return { success: false, error: error.message };
    }
  }

  static async sendReminderEmail(supplier, status) {
    const subject = 'Complete Your Aggrekart Supplier Registration';
    const content = `
      Dear ${supplier.tradeOwnerName},

      Your Aggrekart supplier registration is ${status.completionPercentage}% complete.

      To start selling construction materials, please complete:

      ${!status.documentsUploaded ? '□ Upload required documents' : '✓ Documents uploaded'}
      ${!supplier.isApproved ? '□ Wait for admin approval' : '✓ Account approved'}
      ${!status.profileComplete ? '□ Complete your profile setup' : '✓ Profile complete'}
      ${!status.productsAdded ? '□ Add your first products' : '✓ Products added'}

      Login to continue: [Dashboard Link]

      Need help? Reply to this email or call our support team.

      Best regards,
      Aggrekart Team
    `;

    await sendEmail(supplier.email, subject, content);
  }
}

module.exports = SupplierOnboarding;