import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    
    const orderData = {
      name: formData.get('name') as string,
      email: formData.get('email') as string,
      notes: formData.get('notes') as string || '',
      fileName: formData.get('fileName') as string,
      fileSize: formData.get('fileSize') as string,
      material: formData.get('material') as string,
      color: formData.get('color') as string,
      infill: formData.get('infill') as string,
      layerHeight: formData.get('layerHeight') as string,
      quantity: formData.get('quantity') as string,
      speed: formData.get('speed') as string,
      delivery: formData.get('delivery') as string,
      deliveryAddress: formData.get('deliveryAddress') as string || '',
      deliveryDistance: formData.get('deliveryDistance') as string || '',
      volume: formData.get('volume') as string,
      filamentGrams: formData.get('filamentGrams') as string,
      estimatedTime: formData.get('estimatedTime') as string,
      manufacturingPrice: formData.get('manufacturingPrice') as string,
      deliveryPrice: formData.get('deliveryPrice') as string,
      totalPrice: formData.get('totalPrice') as string,
    };

    const modelImage = formData.get('modelImage') as File | null;
    const modelFile = formData.get('modelFile') as File | null;

    // Convert image to base64 for email
    let imageBase64 = '';
    if (modelImage) {
      const imageBuffer = await modelImage.arrayBuffer();
      imageBase64 = Buffer.from(imageBuffer).toString('base64');
    }

    // Convert file to base64 for email attachment
    let fileBase64 = '';
    let fileMimeType = 'application/octet-stream';
    if (modelFile) {
      const fileBuffer = await modelFile.arrayBuffer();
      fileBase64 = Buffer.from(fileBuffer).toString('base64');
      fileMimeType = modelFile.type || 'application/octet-stream';
    }

    // Helper function to escape HTML
    const escapeHtml = (text: string): string => {
      const map: Record<string, string> = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;',
      };
      return text.replace(/[&<>"']/g, (m) => map[m]);
    };

    // Format email content
    const emailHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            h1 { color: #1a1a1a; border-bottom: 2px solid #1a1a1a; padding-bottom: 10px; }
            .section { margin: 20px 0; padding: 15px; background-color: #f9f9f9; border-radius: 5px; }
            .label { font-weight: bold; color: #555; }
            .value { margin-left: 10px; }
            .image-container { text-align: center; margin: 20px 0; }
            .image-container img { max-width: 100%; height: auto; border: 1px solid #ddd; border-radius: 5px; }
            table { width: 100%; border-collapse: collapse; margin: 10px 0; }
            table td { padding: 8px; border-bottom: 1px solid #eee; }
            table td.label { width: 40%; font-weight: bold; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>New 3D Print Order</h1>
            
            <div class="section">
              <h2>Customer Information</h2>
              <table>
                <tr><td class="label">Name:</td><td>${escapeHtml(orderData.name)}</td></tr>
                <tr><td class="label">Email:</td><td>${escapeHtml(orderData.email)}</td></tr>
              </table>
            </div>

            <div class="section">
              <h2>File Information</h2>
              <table>
                <tr><td class="label">File Name:</td><td>${escapeHtml(orderData.fileName)}</td></tr>
                <tr><td class="label">File Size:</td><td>${escapeHtml(orderData.fileSize)}</td></tr>
              </table>
            </div>

            ${imageBase64 ? `
            <div class="section">
              <h2>Model Preview</h2>
              <div class="image-container">
                <img src="data:image/png;base64,${imageBase64}" alt="3D Model Preview" />
              </div>
            </div>
            ` : ''}

            <div class="section">
              <h2>Model Dimensions</h2>
              <table>
                <tr><td class="label">Volume:</td><td>${escapeHtml(orderData.volume)} cm³</td></tr>
                <tr><td class="label">Filament Required:</td><td>${escapeHtml(orderData.filamentGrams)} g</td></tr>
                <tr><td class="label">Estimated Print Time:</td><td>${escapeHtml(orderData.estimatedTime)} minutes</td></tr>
              </table>
            </div>

            <div class="section">
              <h2>Print Settings</h2>
              <table>
                <tr><td class="label">Material:</td><td>${escapeHtml(orderData.material.toUpperCase())}</td></tr>
                <tr><td class="label">Color:</td><td>${escapeHtml(orderData.color.charAt(0).toUpperCase() + orderData.color.slice(1))}</td></tr>
                <tr><td class="label">Infill:</td><td>${escapeHtml(orderData.infill)}%</td></tr>
                <tr><td class="label">Layer Height:</td><td>${escapeHtml(orderData.layerHeight)} mm</td></tr>
                <tr><td class="label">Quantity:</td><td>${escapeHtml(orderData.quantity)}</td></tr>
                <tr><td class="label">Speed:</td><td>${escapeHtml(orderData.speed.charAt(0).toUpperCase() + orderData.speed.slice(1))}</td></tr>
                <tr><td class="label">Delivery:</td><td>${orderData.delivery === 'delivery' ? 'Local Delivery' : 'Pickup'}</td></tr>
                ${orderData.delivery === 'delivery' && orderData.deliveryAddress ? `
                <tr><td class="label">Delivery Address:</td><td>${escapeHtml(orderData.deliveryAddress)}</td></tr>
                ${orderData.deliveryDistance ? `<tr><td class="label">Distance:</td><td>${escapeHtml(orderData.deliveryDistance)} km</td></tr>` : ''}
                ` : ''}
              </table>
            </div>

            <div class="section">
              <h2>Pricing</h2>
              <table>
                <tr><td class="label">Manufacturing Price:</td><td>$${escapeHtml(orderData.manufacturingPrice)} CAD</td></tr>
                ${parseFloat(orderData.deliveryPrice) > 0 ? `<tr><td class="label">Delivery Price:</td><td>$${escapeHtml(orderData.deliveryPrice)} CAD</td></tr>` : ''}
                <tr><td class="label"><strong>Total Price:</strong></td><td><strong>$${escapeHtml(orderData.totalPrice)} CAD</strong></td></tr>
              </table>
            </div>

            ${orderData.notes ? `
            <div class="section">
              <h2>Notes</h2>
              <p>${escapeHtml(orderData.notes).replace(/\n/g, '<br>')}</p>
            </div>
            ` : ''}
          </div>
        </body>
      </html>
    `;

    // Send email using Resend API
    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    
    if (!RESEND_API_KEY) {
      console.error('RESEND_API_KEY is not set');
      return NextResponse.json(
        { error: 'Email service not configured' },
        { status: 500 }
      );
    }

    const emailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: '3D Print Service <onboarding@resend.dev>', // Update this to your verified domain in Resend
        to: ['dsfeldt@gmail.com'], // Always send orders to you
        reply_to: orderData.email, // Reply to customer's email
        subject: `Print Request - $${orderData.totalPrice} CAD`,
        html: emailHtml,
        attachments: modelFile ? [{
          filename: orderData.fileName,
          content: fileBase64,
          type: fileMimeType,
        }] : undefined,
      }),
    });

    if (!emailResponse.ok) {
      const errorData = await emailResponse.text();
      console.error('Resend API error:', errorData);
      return NextResponse.json(
        { error: 'Failed to send email' },
        { status: 500 }
      );
    }

    const emailResult = await emailResponse.json();
    
    return NextResponse.json({ 
      success: true, 
      messageId: emailResult.id 
    });

  } catch (error) {
    console.error('Error sending order email:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
