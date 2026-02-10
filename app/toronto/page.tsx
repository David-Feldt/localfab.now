import { OrderForm } from "@/components/order-form";

export default function TorontoPage() {
  return (
    <main className="min-h-screen flex flex-col">
      <OrderForm 
        enableDelivery={true}
        recipientEmail="david@3e8robotics.com"
        locationName="Local Toronto 3D print"
      />
    </main>
  );
}
