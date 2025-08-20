const PDFDocument = require('pdfkit');

class InvoiceGenerator {
  
  // EXACT copy of working generateUserDataPDF but for invoices
  static async generateInvoicePDF(order) {
    try {
      const doc = new PDFDocument({ margin: 50 });
      const buffers = [];
      
      doc.on('data', buffers.push.bind(buffers));
      
      // EXACT helper functions from working code
      const formatDate = (date) => new Date(date).toLocaleDateString('en-IN', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
      
      const formatCurrency = (amount) => `Rs.${(amount || 0).toLocaleString('en-IN')}`; // Changed to Rs. to avoid Unicode
      
      // EXACT header pattern from working code
      doc.fontSize(24).font('Helvetica-Bold').fillColor('#007bff').text('AggreKart Invoice', 50, 50);
      doc.fontSize(14).font('Helvetica').fillColor('#666').text(`${order?.customer?.name || 'Customer'} (INVOICE)`, 50, 80);
      doc.text(`Generated on: ${formatDate(new Date())}`, 50, 100);
      
      // EXACT line separator from working code
      doc.strokeColor('#007bff').lineWidth(2).moveTo(50, 130).lineTo(545, 130).stroke();
      
      let yPos = 160;
      
      // Invoice section - using EXACT pattern
      doc.fontSize(18).font('Helvetica-Bold').fillColor('#007bff').text('📋 Invoice Information', 50, yPos);
      yPos += 30;
      
      const invoiceInfo = [
        ['Invoice No:', `INV-${order?.orderId || 'N/A'}`],
        ['Order ID:', order?.orderId || 'N/A'],
        ['Customer:', order?.customer?.name || 'N/A'],
        ['Email:', order?.customer?.email || 'N/A'],
        ['Phone:', order?.customer?.phoneNumber || 'N/A'],
        ['Date:', formatDate(order?.createdAt)],
        ['Status:', (order?.status || 'pending').toUpperCase()]
      ];
      
      invoiceInfo.forEach(([label, value]) => {
        doc.fontSize(12).font('Helvetica-Bold').fillColor('#333').text(label, 50, yPos);
        doc.font('Helvetica').text(value, 150, yPos);
        yPos += 20;
      });
      
      yPos += 20;
      
      // Items section
      doc.fontSize(18).font('Helvetica-Bold').fillColor('#007bff').text('📦 Order Items', 50, yPos);
      yPos += 30;
      
      if (order?.items && order.items.length > 0) {
        order.items.forEach((item, index) => {
          const itemName = item?.productSnapshot?.name || item?.product?.name || `Item ${index + 1}`;
          const quantity = item?.quantity || 1;
          const unitPrice = item?.unitPrice || 0;
          const totalPrice = item?.totalPrice || (unitPrice * quantity);
          
          doc.fontSize(12).font('Helvetica-Bold').fillColor('#333').text(`${index + 1}. ${itemName}`, 50, yPos);
          yPos += 15;
          doc.fontSize(10).font('Helvetica').fillColor('#666').text(`Qty: ${quantity} | Unit: ${formatCurrency(unitPrice)} | Total: ${formatCurrency(totalPrice)}`, 50, yPos);
          yPos += 25;
        });
      } else {
        doc.fontSize(10).font('Helvetica').fillColor('#666').text('No items found', 50, yPos);
        yPos += 20;
      }
      
      yPos += 20;
      
      // Pricing section
      if (order?.pricing) {
        doc.fontSize(18).font('Helvetica-Bold').fillColor('#007bff').text('💰 Payment Summary', 50, yPos);
        yPos += 30;
        
        const pricingInfo = [
          ['Subtotal:', formatCurrency(order.pricing.subtotal || 0)],
          ['Tax/GST:', formatCurrency(order.pricing.gstAmount || 0)],
          ['Commission:', formatCurrency(order.pricing.commission || 0)],
          ['Gateway Charges:', formatCurrency(order.pricing.paymentGatewayCharges || 0)],
          ['TOTAL AMOUNT:', formatCurrency(order.pricing.totalAmount || 0)]
        ];
        
        pricingInfo.forEach(([label, value]) => {
          doc.fontSize(12).font('Helvetica-Bold').fillColor('#333').text(label, 50, yPos);
          doc.font('Helvetica').text(value, 300, yPos);
          yPos += 20;
        });
      }
      
      // EXACT footer from working code
      doc.fontSize(10).font('Helvetica').fillColor('#666')
        .text('Thank you for choosing AggreKart for your construction needs!', 50, 750)
        .text('This invoice was generated from AggreKart platform.', 50, 765);
      
      // EXACT end pattern from working code
      doc.end();
      
      return new Promise((resolve, reject) => {
        doc.on('end', () => {
          resolve(Buffer.concat(buffers));
        });
        doc.on('error', reject);
      });
      
    } catch (error) {
      throw new Error(`Invoice PDF generation failed: ${error.message}`);
    }
  }
}

module.exports = InvoiceGenerator;