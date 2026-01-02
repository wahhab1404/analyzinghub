'use client'

import { motion } from 'framer-motion'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { useLanguage } from '@/lib/i18n/language-context'

export function FAQ() {
  const { t } = useLanguage()
  const faqs = [
    { question: t.landing.faq.q1.question, answer: t.landing.faq.q1.answer },
    { question: t.landing.faq.q2.question, answer: t.landing.faq.q2.answer },
    { question: t.landing.faq.q3.question, answer: t.landing.faq.q3.answer },
    { question: t.landing.faq.q4.question, answer: t.landing.faq.q4.answer },
    { question: t.landing.faq.q5.question, answer: t.landing.faq.q5.answer },
    { question: t.landing.faq.q6.question, answer: t.landing.faq.q6.answer },
    { question: t.landing.faq.q7.question, answer: t.landing.faq.q7.answer },
    { question: t.landing.faq.q8.question, answer: t.landing.faq.q8.answer },
    { question: t.landing.faq.q9.question, answer: t.landing.faq.q9.answer },
    { question: t.landing.faq.q10.question, answer: t.landing.faq.q10.answer },
    { question: t.landing.faq.q11.question, answer: t.landing.faq.q11.answer },
  ]

  return (
    <section id="faq" className="py-24 relative">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom,_var(--tw-gradient-stops))] from-primary/20 via-transparent to-transparent" />

      <div className="container relative mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="mb-16 text-center"
        >
          <h2 className="mb-4 text-4xl font-bold text-foreground sm:text-5xl">
            {t.landing.faq.title}
          </h2>
          <p className="mx-auto max-w-2xl text-xl text-muted-foreground">
            {t.landing.faq.subtitle}
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="mx-auto max-w-3xl"
        >
          <Accordion type="single" collapsible className="space-y-4">
            {faqs.map((faq, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.3, delay: index * 0.05 }}
              >
                <AccordionItem
                  value={`item-${index}`}
                  className="border border-border rounded-lg bg-card px-6"
                >
                  <AccordionTrigger className="text-left text-foreground hover:text-primary">
                    {faq.question}
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground leading-relaxed">
                    {faq.answer}
                  </AccordionContent>
                </AccordionItem>
              </motion.div>
            ))}
          </Accordion>
        </motion.div>
      </div>
    </section>
  )
}
