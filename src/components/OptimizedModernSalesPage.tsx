import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSupabaseSales } from '../hooks/useSupabaseSales';
import { useSupabaseProducts } from '../hooks/useSupabaseProducts';
import { useSupabaseCustomers } from '../hooks/useSupabaseCustomers';
import { useOfflineSales } from '../hooks/useOfflineSales';
import { useOfflineManager } from '../hooks/useOfflineManager';
import { formatCurrency } from '../utils/currency';
import { Product, Customer } from '../types';
import { CartItem } from '../types/cart';
import { ShoppingCart, Package, UserPlus, Search, X, Minus, Plus, Wifi, WifiOff, Clock } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useIsMobile, useIsTablet } from '@/hooks/use-mobile';
import AddCustomerModal from './sales/AddCustomerModal';
import AddDebtModal from './sales/AddDebtModal';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

type PaymentMethod = 'cash' | 'mpesa' | 'debt';

const OptimizedModernSalesPage = () => {
  const navigate = useNavigate();
  const [cart, setCart] = useState<CartItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [isProcessingCheckout, setIsProcessingCheckout] = useState(false);
  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const [showAddDebt, setShowAddDebt] = useState(false);
  const [activePanel, setActivePanel] = useState<'search' | 'cart'>('search');
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  const { user } = useAuth();
  const { toast } = useToast();

  const { sales, loading: salesLoading } = useSupabaseSales();
  const { products, loading: productsLoading } = useSupabaseProducts();
  const { customers, loading: customersLoading, updateCustomer } = useSupabaseCustomers();
  const { createOfflineSale, isCreating: isCreatingOfflineSale } = useOfflineSales();
  const { isOnline, pendingOperations } = useOfflineManager();

  const isLoading = salesLoading || productsLoading || customersLoading;

  useEffect(() => {
    const productsChannel = supabase
      .channel('products-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, (payload) => {
        console.log('Products updated:', payload);
      })
      .subscribe();

    const customersChannel = supabase
      .channel('customers-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'customers' }, (payload) => {
        console.log('Customers updated:', payload);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(productsChannel);
      supabase.removeChannel(customersChannel);
    };
  }, []);

  const total = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.sellingPrice * item.quantity, 0);
  }, [cart]);

  const filteredProducts = useMemo(() => {
    const term = searchTerm.toLowerCase();
    return products.filter(product =>
      product.name.toLowerCase().includes(term) ||
      product.category.toLowerCase().includes(term)
    );
  }, [products, searchTerm]);

  const addToCart = (product: Product) => {
    if (product.currentStock === 0) {
      const shouldAdd = window.confirm('This product is out of stock. Do you want to add it anyway?');
      if (!shouldAdd) return;
    }

    const existingItem = cart.find(item => item.id === product.id);
    if (existingItem) {
      const updatedCart = cart.map(item =>
        item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
      );
      setCart(updatedCart);
    } else {
      const cartItem: CartItem = { ...product, quantity: 1 };
      setCart([...cart, cartItem]);
    }
  };

  const removeFromCart = (productId: string) => {
    const updatedCart = cart.filter(item => item.id !== productId);
    setCart(updatedCart);
  };

  const updateQuantity = (productId: string, newQuantity: number) => {
    if (newQuantity <= 0) {
      removeFromCart(productId);
      return;
    }

    const updatedCart = cart.map(item =>
      item.id === productId ? { ...item, quantity: newQuantity } : item
    );
    setCart(updatedCart);
  };

  const clearCart = () => {
    setCart([]);
  };

  const handleCheckout = async () => {
    if (cart.length === 0) return;
    if (paymentMethod === 'debt' && !selectedCustomerId) {
      toast({
        title: "Customer Required",
        description: "Please select a customer for debt transactions.",
        variant: "destructive",
      });
      return;
    }

    setIsProcessingCheckout(true);

    try {
      const customer = selectedCustomerId 
        ? customers.find(c => c.id === selectedCustomerId) || null 
        : null;

      if (isOnline) {
        await processOnlineSale(selectedCustomerId, customer);
      } else {
        await processOfflineSale(selectedCustomerId, customer);
      }

      toast({
        title: "Sale Completed!",
        description: `Transaction processed successfully${!isOnline ? ' (offline)' : ''}.`,
      });

      clearCart();
      setSelectedCustomerId(null);
      setPaymentMethod('cash');
    } catch (error) {
      console.error('Checkout error:', error);
      toast({
        title: "Error",
        description: "Failed to process sale. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsProcessingCheckout(false);
    }
  };

  const processOnlineSale = async (customerId: string | null, customer: Customer | null) => {
    if (!user) throw new Error('User not authenticated');

    for (const item of cart) {
      const saleData = {
        user_id: user.id,
        product_id: item.id,
        product_name: item.name,
        quantity: item.quantity,
        selling_price: item.sellingPrice,
        cost_price: item.costPrice,
        profit: (item.sellingPrice - item.costPrice) * item.quantity,
        total_amount: item.sellingPrice * item.quantity,
        customer_id: customerId,
        customer_name: customer?.name || null,
        payment_method: paymentMethod,
        payment_details: {},
        timestamp: new Date().toISOString(),
        synced: true,
      };

      const { error: saleError } = await supabase
        .from('sales')
        .insert(saleData);

      if (saleError) {
        throw new Error(`Failed to create sale for ${item.name}: ${saleError.message}`);
      }

      if (paymentMethod === 'debt' && customer) {
        const currentDebt = customer.outstandingDebt || 0;
        await updateCustomer(customer.id, {
          outstandingDebt: currentDebt + (item.sellingPrice * item.quantity),
          totalPurchases: (customer.totalPurchases || 0) + (item.sellingPrice * item.quantity),
          lastPurchaseDate: new Date().toISOString(),
        });
      }

      const { error: stockError } = await supabase
        .from('products')
        .update({
          current_stock: Math.max(0, item.currentStock - item.quantity)
        })
        .eq('id', item.id);

      if (stockError) {
        console.warn(`Failed to update stock for ${item.name}:`, stockError);
      }
    }
  };

  const processOfflineSale = async (customerId: string | null, customer: Customer | null) => {
    if (!user) throw new Error('User not authenticated');

    for (const item of cart) {
      const saleData = {
        user_id: user.id,
        product_id: item.id,
        product_name: item.name,
        quantity: item.quantity,
        selling_price: item.sellingPrice,
        cost_price: item.costPrice,
        profit: (item.sellingPrice - item.costPrice) * item.quantity,
        total_amount: item.sellingPrice * item.quantity,
        customer_id: customerId,
        customer_name: customer?.name || null,
        payment_method: paymentMethod,
        payment_details: {},
        timestamp: new Date().toISOString(),
        synced: false,
      };

      await createOfflineSale(saleData);
    }
  };

  const getStockDisplayText = (stock: number) => {
    if (stock < 0) return 'Unspecified';
    if (stock === 0) return 'Out of Stock';
    return stock.toString();
  };

  const getStockColorClass = (stock: number, lowStockThreshold: number = 10) => {
    if (stock < 0) return 'text-gray-500 dark:text-gray-400';
    if (stock === 0) return 'text-orange-500 dark:text-orange-400';
    if (stock <= lowStockThreshold) return 'text-yellow-500 dark:text-yellow-400';
    return 'text-purple-500 dark:text-purple-400';
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-pink-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-pink-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
      {/* Mobile-Optimized Header */}
      <header className="bg-white/95 dark:bg-slate-800/95 backdrop-blur-xl border-b border-gray-200/60 dark:border-slate-700/60 sticky top-0 z-40 shadow-lg">
        <div className="mx-auto px-3 sm:px-4 py-3 sm:py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 sm:gap-4">
              <h1 className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white tracking-tight">
                🛒 SALES
              </h1>
              
              {/* Connection Status - Compact on mobile */}
              <div className="flex items-center gap-1 sm:gap-2">
                {isOnline ? (
                  <div className="flex items-center gap-1 px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-full text-xs font-bold">
                    <Wifi className="h-3 w-3" />
                    {!isMobile && "Online"}
                  </div>
                ) : (
                  <div className="flex items-center gap-1 px-2 py-1 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 rounded-full text-xs font-bold">
                    <WifiOff className="h-3 w-3" />
                    {!isMobile && "Offline"}
                  </div>
                )}
                
                {pendingOperations > 0 && (
                  <div className="flex items-center gap-1 px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full text-xs font-bold">
                    <Clock className="h-3 w-3" />
                    {!isMobile ? `${pendingOperations} pending` : pendingOperations}
                  </div>
                )}
              </div>
            </div>
            
            {/* Mobile Panel Toggle - Enhanced Touch Targets */}
            {isMobile && (
              <div className="flex gap-1">
                <button
                  onClick={() => setActivePanel('search')}
                  className={`px-3 py-2 rounded-xl text-xs font-bold transition-all touch-target ${
                    activePanel === 'search'
                      ? 'bg-purple-600 text-white shadow-lg scale-105'
                      : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-600'
                  }`}
                >
                  Products
                </button>
                <button
                  onClick={() => setActivePanel('cart')}
                  className={`px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1 touch-target ${
                    activePanel === 'cart'
                      ? 'bg-purple-600 text-white shadow-lg scale-105'
                      : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-600'
                  }`}
                >
                  <ShoppingCart className="h-3 w-3" />
                  Cart {cart.length > 0 && `(${cart.length})`}
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 flex">
        {/* Left Panel - Product Search & Quick Picks - Mobile Optimized */}
        <div className={`${
          isMobile 
            ? activePanel === 'search' ? 'flex' : 'hidden'
            : 'flex'
        } flex-col ${isMobile ? 'w-full' : 'w-2/3 border-r border-gray-200/60 dark:border-slate-700/60'}`}>
          
          {/* Search Section - Enhanced Mobile */}
          <div className="p-3 sm:p-4 bg-white/50 dark:bg-slate-800/50 border-b border-gray-200/60 dark:border-slate-700/60">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-gray-500" />
              <input
                type="text"
                placeholder="Search products..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-10 py-3 bg-white dark:bg-slate-700 border-2 border-purple-200 dark:border-purple-600/30 rounded-xl focus:outline-none focus:border-purple-400 dark:focus:border-purple-500 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 transition-all"
                style={{ fontSize: '16px' }} // Prevent zoom on iOS
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 touch-target flex items-center justify-center"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          {/* Quick Select Section - Touch-Optimized */}
          <div className="p-3 sm:p-4 bg-white/30 dark:bg-slate-800/30 border-b border-gray-200/40 dark:border-slate-700/40">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-3">⚡ Quick Picks</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
              {products.slice(0, 6).map((product) => (
                <button
                  key={product.id}
                  onClick={() => addToCart(product)}
                  className="bg-white dark:bg-slate-700 border-2 border-gray-200 dark:border-slate-600 rounded-xl p-3 hover:border-purple-300 dark:hover:border-purple-500 hover:shadow-lg transition-all group min-h-[80px] active:scale-95"
                >
                  <div className="font-bold text-gray-900 dark:text-white text-sm mb-1 group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors line-clamp-2">
                    {product.name}
                  </div>
                  <div className="text-purple-600 dark:text-purple-400 font-bold text-base sm:text-lg">
                    {formatCurrency(product.sellingPrice)}
                  </div>
                  <div className={`text-xs mt-1 ${getStockColorClass(product.currentStock)}`}>
                    {getStockDisplayText(product.currentStock)}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Product Grid - Mobile Optimized */}
          <div className="flex-1 overflow-y-auto p-3 sm:p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pb-20">
              {filteredProducts.length === 0 ? (
                <div className="col-span-full text-center text-gray-500 dark:text-gray-400 py-8">
                  <Package className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p className="font-bold">No products found</p>
                  <p className="text-sm">Try adjusting your search</p>
                </div>
              ) : (
                filteredProducts.map((product) => (
                  <button
                    key={product.id}
                    onClick={() => addToCart(product)}
                    className="bg-white dark:bg-slate-700 border-2 border-gray-200 dark:border-slate-600 rounded-xl p-4 hover:border-purple-300 dark:hover:border-purple-500 hover:shadow-lg transition-all group text-left active:scale-95"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-gray-900 dark:text-white text-sm group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors line-clamp-2">
                          {product.name}
                        </h3>
                        <p className="text-gray-500 dark:text-gray-400 text-xs">
                          {product.category}
                        </p>
                      </div>
                      <div className="ml-2">
                        <Package className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                      </div>
                    </div>
                    <div className="flex justify-between items-end">
                      <div>
                        <div className="text-purple-600 dark:text-purple-400 font-bold text-lg">
                          {formatCurrency(product.sellingPrice)}
                        </div>
                        <div className={`text-xs ${getStockColorClass(product.currentStock)}`}>
                          Stock: {getStockDisplayText(product.currentStock)}
                        </div>
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right Panel - Cart & Checkout - Mobile Optimized */}
        <div className={`${
          isMobile 
            ? activePanel === 'cart' ? 'flex' : 'hidden'
            : 'flex'
        } flex-col ${isMobile ? 'w-full' : 'w-1/3'} bg-white/60 dark:bg-slate-800/60`}>
          
          {/* Cart Header - Compact on Mobile */}
          <div className="p-3 sm:p-4 border-b border-gray-200/60 dark:border-slate-700/60 bg-white/80 dark:bg-slate-800/80">
            <div className="flex items-center justify-between mb-3 sm:mb-4">
              <h2 className="text-lg sm:text-xl font-black text-gray-900 dark:text-white flex items-center gap-2">
                <ShoppingCart className="h-4 w-4 sm:h-5 sm:w-5 text-purple-600 dark:text-purple-400" />
                Cart ({cart.length})
              </h2>
              {cart.length > 0 && (
                <button
                  onClick={clearCart}
                  className="text-red-500 hover:text-red-700 text-sm font-bold px-3 py-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors touch-target"
                >
                  Clear All
                </button>
              )}
            </div>
            <div className="text-xl sm:text-2xl font-black text-purple-600 dark:text-purple-400">
              Total: {formatCurrency(total)}
            </div>
          </div>

          {/* Cart Items - Touch-Optimized */}
          <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3">
            {cart.length === 0 ? (
              <div className="text-center text-gray-500 dark:text-gray-400 py-8">
                <Package className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p className="font-bold">Your cart is empty</p>
                <p className="text-sm">Add products to get started</p>
              </div>
            ) : (
              cart.map((item) => (
                <div
                  key={item.id}
                  className="bg-white dark:bg-slate-700 rounded-xl p-3 sm:p-4 border-2 border-gray-200 dark:border-slate-600 shadow-sm hover:shadow-md transition-all"
                >
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex-1 pr-2">
                      <h3 className="font-bold text-gray-900 dark:text-white text-sm line-clamp-2">
                        {item.name}
                      </h3>
                      <p className="text-purple-600 dark:text-purple-400 font-bold text-base sm:text-lg">
                        {formatCurrency(item.sellingPrice)}
                      </p>
                    </div>
                    <button
                      onClick={() => removeFromCart(item.id)}
                      className="text-red-500 hover:text-red-700 p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors touch-target flex items-center justify-center"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 sm:gap-3">
                      <button
                        onClick={() => updateQuantity(item.id, item.quantity - 1)}
                        className="w-10 h-10 sm:w-8 sm:h-8 bg-gray-100 dark:bg-slate-600 hover:bg-gray-200 dark:hover:bg-slate-500 rounded-lg flex items-center justify-center transition-colors active:scale-95"
                        disabled={item.quantity <= 1}
                      >
                        <Minus className="h-4 w-4 text-gray-600 dark:text-gray-300" />
                      </button>
                      <span className="font-bold text-lg text-gray-900 dark:text-white min-w-[2.5rem] text-center">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() => updateQuantity(item.id, item.quantity + 1)}
                        className="w-10 h-10 sm:w-8 sm:h-8 bg-gray-100 dark:bg-slate-600 hover:bg-gray-200 dark:hover:bg-slate-500 rounded-lg flex items-center justify-center transition-colors active:scale-95"
                      >
                        <Plus className="h-4 w-4 text-gray-600 dark:text-gray-300" />
                      </button>
                    </div>
                    <div className="text-right">
                      <div className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">Subtotal</div>
                      <div className="font-bold text-gray-900 dark:text-white text-sm sm:text-base">
                        {formatCurrency(item.sellingPrice * item.quantity)}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Checkout Section - Mobile Optimized */}
          {cart.length > 0 && (
            <div className="p-3 sm:p-4 border-t border-gray-200/60 dark:border-slate-700/60 bg-white/80 dark:bg-slate-800/80 space-y-4 pb-safe">
              
              {/* Customer Selection - Touch-Friendly */}
              <div>
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">
                  Customer (Optional)
                </label>
                <div className="flex gap-2">
                  <select
                    value={selectedCustomerId || ''}
                    onChange={(e) => setSelectedCustomerId(e.target.value || null)}
                    className="flex-1 px-3 py-3 bg-white dark:bg-slate-700 border-2 border-gray-200 dark:border-slate-600 rounded-xl focus:outline-none focus:border-purple-400 dark:focus:border-purple-500 text-gray-900 dark:text-white"
                    style={{ fontSize: '16px' }} // Prevent zoom on iOS
                  >
                    <option value="">Select customer...</option>
                    {customers.map((customer) => (
                      <option key={customer.id} value={customer.id}>
                        {customer.name} - {customer.phone}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => setShowAddCustomer(true)}
                    className="px-3 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl transition-colors flex items-center justify-center min-w-[44px] active:scale-95"
                    title="Add new customer"
                  >
                    <UserPlus className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Payment Method Selection - Touch-Optimized */}
              <div>
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">
                  Payment Method
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['cash', 'mpesa', 'debt'] as PaymentMethod[]).map((method) => (
                    <button
                      key={method}
                      onClick={() => setPaymentMethod(method)}
                      className={`px-3 py-3 rounded-xl text-sm font-bold transition-all touch-target active:scale-95 ${
                        paymentMethod === method
                          ? 'bg-purple-600 text-white shadow-lg scale-105'
                          : 'bg-gray-100 dark:bg-slate-600 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-500'
                      }`}
                    >
                      {method.charAt(0).toUpperCase() + method.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Debt-specific validation */}
              {paymentMethod === 'debt' && !selectedCustomerId && (
                <div className="bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-700 rounded-xl p-3">
                  <p className="text-yellow-700 dark:text-yellow-300 text-sm font-bold">
                    ⚠️ Please select a customer for debt transactions
                  </p>
                </div>
              )}

              {/* Quick Action Buttons - Mobile Stack */}
              <div className={`flex gap-2 ${isMobile ? 'flex-col' : 'flex-row'}`}>
                <button
                  onClick={() => setShowAddCustomer(true)}
                  className="flex-1 px-4 py-3 bg-green-600 hover:bg-green-700 text-white rounded-xl font-bold transition-colors flex items-center justify-center gap-2 touch-target active:scale-95"
                >
                  <UserPlus className="h-4 w-4" />
                  Add Customer
                </button>
                <button
                  onClick={() => setShowAddDebt(true)}
                  className="flex-1 px-4 py-3 bg-orange-600 hover:bg-orange-700 text-white rounded-xl font-bold transition-colors flex items-center justify-center gap-2 touch-target active:scale-95"
                >
                  <Package className="h-4 w-4" />
                  Record Debt
                </button>
              </div>

              {/* Checkout Button - Enhanced for Mobile */}
              <button
                onClick={handleCheckout}
                disabled={
                  isProcessingCheckout ||
                  cart.length === 0 ||
                  (paymentMethod === 'debt' && !selectedCustomerId)
                }
                className="w-full px-6 py-4 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 disabled:from-gray-400 disabled:to-gray-500 disabled:cursor-not-allowed text-white font-black text-lg rounded-xl shadow-lg hover:shadow-xl transition-all transform hover:scale-105 disabled:transform-none active:scale-95 min-h-[56px]"
              >
                {isProcessingCheckout ? (
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Processing...
                  </div>
                ) : (
                  `💳 Complete Sale - ${formatCurrency(total)}`
                )}
              </button>
            </div>
          )}
        </div>
      </main>

      {/* Modals */}
      {showAddCustomer && (
        <AddCustomerModal
          open={showAddCustomer}
          onOpenChange={setShowAddCustomer}
          onCustomerAdded={(customer) => {
            setSelectedCustomerId(customer.id);
            setShowAddCustomer(false);
          }}
        />
      )}

      {showAddDebt && (
        <AddDebtModal
          isOpen={showAddDebt}
          onClose={() => setShowAddDebt(false)}
        />
      )}
    </div>
  );
};

export default OptimizedModernSalesPage;