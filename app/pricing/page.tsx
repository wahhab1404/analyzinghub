'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, Star } from 'lucide-react';

interface Package {
  key: string;
  name: string;
  description: string;
  price: string;
  features: string[];
  cta: string;
  highlighted?: boolean;
}

const packages: Package[] = [
  {
    key: 'free_trader',
    name: 'Free Trader',
    description: 'Perfect for getting started',
    price: '$0',
    features: [
      'Follow up to 50 analyzers',
      'Browse public analyses',
      'View verified track records',
      'Basic notifications',
      'Community access (likes + limited comments)',
    ],
    cta: 'Get Started',
  },
  {
    key: 'pro_trader',
    name: 'Pro Trader',
    description: 'For serious traders',
    price: 'Coming Soon',
    features: [
      'Everything in Free Trader',
      'Unlimited analyzer follows',
      'Symbol watchlist',
      'Live SPX/NDX index updates',
      'Advanced alerts & Telegram notifications',
      'Personalized feed algorithm',
      'Export analysis history (PDF/CSV)',
      'Priority support',
    ],
    cta: 'Join Waitlist',
    highlighted: true,
  },
  {
    key: 'analyzer_pro',
    name: 'Analyzer Pro',
    description: 'For professional analysts',
    price: 'Coming Soon',
    features: [
      'Everything in Pro Trader',
      'Publish analyses (up to 20/day)',
      '5-minute edit window with audit trail',
      'Extended targets feature',
      'Live analysis mode with follow-ups',
      'Live index coverage (SPX/NDX)',
      'Up to 2 Telegram channels',
    ],
    cta: 'Apply Now',
  },
  {
    key: 'analyzer_elite',
    name: 'Analyzer Elite',
    description: 'Invitation only',
    price: 'Custom',
    features: [
      'Everything in Analyzer Pro',
      'Unlimited analyses per day',
      'Elite badge',
      'Up to 4 Telegram channels',
      'Advanced subscriber controls',
      'Exclusive analytics dashboard',
      'Private support',
      'Early access to new features',
    ],
    cta: 'Request Invitation',
  },
];

export default function PricingPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleCTA = (packageKey: string) => {
    if (packageKey === 'free_trader') {
      router.push('/register');
    } else {
      alert('This feature is coming soon! Please contact support for early access.');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
      <div className="container mx-auto px-4 py-16">
        <div className="text-center mb-16">
          <h1 className="text-4xl md:text-5xl font-bold mb-4">
            Choose Your Plan
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Start free and upgrade as you grow. All plans include access to our community and verified analyst track records.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 max-w-7xl mx-auto">
          {packages.map((pkg) => (
            <Card
              key={pkg.key}
              className={`relative flex flex-col ${
                pkg.highlighted
                  ? 'border-primary shadow-lg scale-105'
                  : 'border-border'
              }`}
            >
              {pkg.highlighted && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                  <Badge className="bg-primary text-primary-foreground">
                    <Star className="w-3 h-3 mr-1" />
                    Popular
                  </Badge>
                </div>
              )}

              <CardHeader>
                <CardTitle className="text-2xl">{pkg.name}</CardTitle>
                <CardDescription>{pkg.description}</CardDescription>
              </CardHeader>

              <CardContent className="flex-1">
                <div className="mb-6">
                  <div className="text-3xl font-bold">{pkg.price}</div>
                  {pkg.price !== 'Custom' && pkg.price !== 'Coming Soon' && (
                    <div className="text-sm text-muted-foreground">/month</div>
                  )}
                </div>

                <ul className="space-y-3">
                  {pkg.features.map((feature, index) => (
                    <li key={index} className="flex items-start gap-2">
                      <Check className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                      <span className="text-sm">{feature}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>

              <CardFooter>
                <Button
                  className="w-full"
                  variant={pkg.highlighted ? 'default' : 'outline'}
                  onClick={() => handleCTA(pkg.key)}
                  disabled={loading}
                >
                  {pkg.cta}
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>

        <div className="mt-16 text-center">
          <p className="text-muted-foreground mb-4">
            Need a custom plan or have questions?
          </p>
          <Button variant="link" onClick={() => router.push('/contact')}>
            Contact Us
          </Button>
        </div>
      </div>
    </div>
  );
}
