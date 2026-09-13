import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { buyCoins, buyVip } from "@/lib/dramawave.functions";
import { Coins, Crown, Sparkles } from "lucide-react";

export function CoinShopModal({
  open,
  onOpenChange,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSuccess?: () => void;
}) {
  const [tab, setTab] = useState<"coins" | "vip">("coins");
  const buyCoinsFn = useServerFn(buyCoins);
  const buyVipFn = useServerFn(buyVip);

  const purchase = async (pack: "small" | "medium" | "large") => {
    try {
      await buyCoinsFn({ data: { pack } });
      onSuccess?.();
      toast.success("Coins added to your balance!");
    } catch (err: any) {
      toast.error(err.message || "Purchase failed.");
    }
  };

  const purchaseVip = async () => {
    try {
      await buyVipFn();
      onSuccess?.();
      toast.success("VIP activated for 30 days!");
    } catch (err: any) {
      toast.error(err.message || "Could not activate VIP.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm rounded-3xl border-dw-border bg-dw-card text-dw-foreground">
        <DialogHeader>
          <DialogTitle className="text-center text-xl font-bold">Coin Shop</DialogTitle>
        </DialogHeader>

        <div className="mt-2 flex rounded-full bg-dw-background p-1">
          <button
            onClick={() => setTab("coins")}
            className={`flex-1 rounded-full py-2 text-xs font-semibold transition-colors ${
              tab === "coins" ? "bg-dw-card text-dw-foreground shadow" : "text-dw-muted"
            }`}
          >
            Coins
          </button>
          <button
            onClick={() => setTab("vip")}
            className={`flex-1 rounded-full py-2 text-xs font-semibold transition-colors ${
              tab === "vip" ? "bg-dw-card text-dw-foreground shadow" : "text-dw-muted"
            }`}
          >
            VIP
          </button>
        </div>

        {tab === "coins" ? (
          <div className="mt-4 space-y-3">
            <CoinPack
              name="Starter"
              coins={500}
              price="49 SEK"
              icon={<Coins className="size-6 text-dw-gold" />}
              onClick={() => purchase("small")}
            />
            <CoinPack
              name="Popular"
              coins={1500}
              bonus="+500 bonus"
              price="99 SEK"
              icon={<Sparkles className="size-6 text-dw-primary" />}
              highlight
              onClick={() => purchase("medium")}
            />
            <CoinPack
              name="Mega"
              coins={5000}
              bonus="+2000 bonus"
              price="249 SEK"
              icon={<Coins className="size-6 text-dw-gold" />}
              onClick={() => purchase("large")}
            />
          </div>
        ) : (
          <div className="mt-4 rounded-2xl border border-dw-gold/20 bg-dw-gold/5 p-5 text-center">
            <Crown className="mx-auto size-10 text-dw-gold" aria-hidden />
            <h3 className="mt-3 text-lg font-bold">VIP Pass</h3>
            <p className="mt-1 text-sm text-dw-muted">Unlimited access for 30 days</p>
            <p className="mt-3 text-2xl font-bold dw-gold-text">149 SEK/month</p>
            <Button
              onClick={purchaseVip}
              className="mt-4 h-12 w-full rounded-xl dw-btn-gold text-sm font-semibold"
            >
              Activate VIP
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function CoinPack({
  name,
  coins,
  price,
  bonus,
  icon,
  highlight,
  onClick,
}: {
  name: string;
  coins: number;
  price: string;
  bonus?: string;
  icon: React.ReactNode;
  highlight?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center justify-between rounded-2xl border p-4 text-left transition-colors ${
        highlight
          ? "border-dw-primary/30 bg-dw-primary/5"
          : "border-dw-border bg-dw-background/50 hover:bg-dw-card-hover"
      }`}
    >
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-full bg-dw-card">{icon}</div>
        <div>
          <p className="font-semibold">{name}</p>
          <p className="text-xs text-dw-muted">
            {coins.toLocaleString()} coins {bonus && <span className="text-dw-gold">{bonus}</span>}
          </p>
        </div>
      </div>
      <span className="text-sm font-bold">{price}</span>
    </button>
  );
}
