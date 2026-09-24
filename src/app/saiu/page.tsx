// Where guests land after leaving a call
export default function LeftCallPage() {
  return (
    <div className="min-h-screen bg-neutral-100 flex items-center justify-center p-8">
      <div className="max-w-md text-center space-y-3">
        <h1 className="text-2xl font-light text-black">
          Saliste de la reunión
        </h1>
        <p className="text-neutral-600">
          Para volver a entrar, abre de nuevo el enlace de la invitación.
        </p>
        <p className="text-sm text-neutral-500 pt-4">
          Você saiu da reunião. Para voltar, abra de novo o link do convite.
        </p>
      </div>
    </div>
  );
}
