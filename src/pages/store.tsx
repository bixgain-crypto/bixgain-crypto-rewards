import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { supabaseSync } from '../lib/supabase-sync';
import { useAuth } from '../hooks/use-auth';
import { fetchSharedData } from '../lib/shared-data';
import { DashboardLayout } from '../components/dashboard-layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { ShoppingBag, Star, Zap, ShoppingCart, Search } from 'lucide-react';
import { Input } from '../components/ui/input';
import { toast } from 'sonner';

export default function StorePage() {
  const { profile, user, refreshProfile } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchItems = async () => {
      try {
        const storeItems = await fetchSharedData('store_items');
        setItems(storeItems);
      } catch (err) {
        console.error('Error fetching items:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchItems();
  }, []);

  const handlePurchase = async (item: any) => {
    if (!user || profile.balance < item.price) {
      toast.error('Insufficient BIX balance!');
      return;
    }

    try {
      const { error: updateError } = await supabase.from('user_profiles').update({
        balance: profile.balance - item.price,
      }).eq('user_id', user.id);

      if (updateError) throw updateError;

      await supabaseSync.insert('transactions', {
        id: `tx_store_${Date.now()}_${user.id.slice(-4)}`,
        user_id: user.id,
        amount: -item.price,
        type: 'spend',
        description: `Purchased ${item.name} from Store`,
      });

      toast.success(`Successfully purchased ${item.name}!`);
      refreshProfile();
    } catch (err) {
      console.error('Purchase error:', err);
      toast.error('Purchase failed.');
    }
  };

  return (
    <DashboardLayout activePath="/store">
      <div className="space-y-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <h1 className="text-4xl font-display font-bold mb-2">BixGain Marketplace</h1>
            <p className="text-muted-foreground">Spend your earned BIX tokens on exclusive digital and physical items.</p>
          </div>
          <div className="relative w-full md:w-64">
            <Search className="absolute left-3 h-4 w-4 text-muted-foreground" />
            <Input className="pl-10 bg-muted/50 border-none" placeholder="Search items..." />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {loading ? (
            <p className="text-muted-foreground">Loading store...</p>
          ) : items.map((item) => (
            <Card key={item.id} className="glass-card overflow-hidden group hover:border-primary/30 transition-all flex flex-col">
              <div className="aspect-square relative overflow-hidden">
                <img 
                  src={item.image_url} 
                  alt={item.name}
                  className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" 
                />
                <div className="absolute top-2 right-2">
                  <Badge className="bg-background/80 backdrop-blur-md text-foreground border-none">
                    <Star className="h-3 w-3 text-yellow-500 mr-1 fill-yellow-500" />
                    Premium
                  </Badge>
                </div>
              </div>
              <CardHeader className="p-4 space-y-1">
                <CardTitle className="text-lg">{item.name}</CardTitle>
                <CardDescription className="text-xs line-clamp-2">{item.description}</CardDescription>
              </CardHeader>
              <CardContent className="p-4 pt-0 mt-auto">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-1.5">
                    <ShoppingBag className="h-4 w-4 text-primary" />
                    <span className="font-bold text-primary font-display">{item.price.toLocaleString()} BIX</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">Available</span>
                </div>
                <Button 
                  className="w-full gold-gradient gold-glow font-bold gap-2"
                  onClick={() => handlePurchase(item)}
                >
                  <ShoppingCart className="h-4 w-4" />
                  Redeem Now
                </Button>
              </CardContent>
            </Card>
          ))}

          <Card className="glass-card border-dashed border-primary/20 flex flex-col items-center justify-center p-8 text-center bg-transparent">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <Zap className="h-8 w-8 text-primary" />
            </div>
            <h3 className="font-bold mb-2">Exclusive NFTs</h3>
            <p className="text-xs text-muted-foreground mb-4 italic">Next drop in 48 hours. Stay tuned to our socials!</p>
            <Button variant="outline" size="sm" className="border-primary/30 text-primary hover:bg-primary/5">Notify Me</Button>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
