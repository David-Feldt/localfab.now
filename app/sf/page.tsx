import { OrderForm } from "@/components/order-form";

export default function SFPage() {
  return (
    <main className="min-h-screen flex flex-col">
      <OrderForm 
        enableDelivery={false}
        recipientEmail="ari@3e8robotics.com"
        locationName="San Francisco 3D print"
      />
    </main>
  );
}
