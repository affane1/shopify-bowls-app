import {
  Page,
  Card,
  Text,
  BlockStack,
  Frame,
  Toast,
  Icon,
  InlineStack,
  Button,
  Box,
} from '@shopify/polaris';
import { DragHandleIcon } from '@shopify/polaris-icons';
import { useState, useEffect, useMemo } from 'react';
import { useFetcher, useLoaderData, useRevalidator } from '@remix-run/react';
import { authenticate } from '../shopify.server';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// Import GraphQL utilities from the single unified file
import {
  GET_INGREDIENTS_METAOBJECTS_QUERY,
  GET_SORT_ORDER_QUERY,
  SET_SORT_ORDER_MUTATION
} from '../utils/graphql';


// --- SERVER-SIDE LOADER ---
export async function loader({ request }) {
  try {
    const { admin } = await authenticate.admin(request);

    const [ingredientsResponse, orderResponse] = await Promise.all([
      admin.graphql(GET_INGREDIENTS_METAOBJECTS_QUERY),
      admin.graphql(GET_SORT_ORDER_QUERY),
    ]);

    const ingredientsData = await ingredientsResponse.json();
    const orderData = await orderResponse.json();

    if (ingredientsData.errors || orderData.errors) {
        console.error("GraphQL Errors:", {
            ingredients: ingredientsData.errors,
            order: orderData.errors
        });
        throw new Error("Failed to fetch data from Shopify.");
    }

    const allIngredients = ingredientsData.data.metaobjects.edges.map(({ node }) => ({
      id: node.id,
      nombre: node.nombre?.value,
      categoria: node.categoria?.value,
    }));
    
    let categoryOrder = [];
    try {
      categoryOrder = JSON.parse(orderData.data.shop.categoryOrder?.value || '[]');
    } catch(e) {
      console.error("Failed to parse categoryOrder metafield. Value was:", orderData.data.shop.categoryOrder?.value);
      categoryOrder = [];
    }

    let ingredientOrder = {};
    try {
      ingredientOrder = JSON.parse(orderData.data.shop.ingredientOrder?.value || '{}');
    } catch(e) {
      console.error("Failed to parse ingredientOrder metafield. Value was:", orderData.data.shop.ingredientOrder?.value);
      ingredientOrder = {};
    }

    return Response.json({ allIngredients, categoryOrder, ingredientOrder });
  } catch (error) {
    console.error("Error in OrdenPage loader:", error);
    return Response.json({ error: 'Failed to load page data' }, { status: 500 });
  }
}

// --- SERVER-SIDE ACTION ---
export async function action({ request }) {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const payload = JSON.parse(formData.get('payload'));
  const { categoryOrder, ingredientOrder } = payload;
  
  // FIX: Dynamically fetch the shop ID
  const shopIdResponse = await admin.graphql(`query getShopId { shop { id } }`);
  const shopIdData = await shopIdResponse.json();
  const shopId = shopIdData.data.shop.id;

  const metafields = [
      {
          ownerId: shopId,
          namespace: "custom",
          key: "category_order",
          type: "json",
          value: JSON.stringify(categoryOrder)
      },
      {
          ownerId: shopId,
          namespace: "custom",
          key: "ingredient_order",
          type: "json",
          value: JSON.stringify(ingredientOrder)
      }
  ];

  try {
    const response = await admin.graphql(SET_SORT_ORDER_MUTATION, { variables: { metafields } });
    const responseData = await response.json();
    if (responseData.data?.metafieldsSet?.userErrors.length > 0) {
      return Response.json({ errors: responseData.data.metafieldsSet.userErrors }, { status: 422 });
    }
    return Response.json({ success: true, message: 'Orden guardado con éxito.' });
  } catch(error) {
      console.error("Action error:", error);
      return Response.json({ errors: [{ message: "An unexpected server error occurred." }] }, { status: 500 });
  }
}

// --- Sortable Item Component (using dnd-kit) ---
function SortableItem({ id, name, isGroup=false }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({id: id});

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: isDragging ? 'none' : transition,
    zIndex: isDragging ? 100 : 'auto',
    position: 'relative'
  };

  return (
    <Box
      ref={setNodeRef}
      style={style}
      padding="400"
      background={isDragging ? 'bg-surface-selected' : 'bg-surface'}
      borderWidth="025"
      borderColor="border"
      borderRadius="200"
    >
        <InlineStack gap="400" blockAlign="center">
            <div {...attributes} {...listeners} style={{cursor: 'grab', touchAction: 'none'}}>
                <Icon source={DragHandleIcon} tone="subdued" />
            </div>
            <Text variant={isGroup ? 'headingMd' : 'bodyMd'} as="span">{name}</Text>
        </InlineStack>
    </Box>
  );
}

// --- MAIN REACT COMPONENT ---
export default function OrdenPage() {
    const loaderData = useLoaderData();
    const fetcher = useFetcher();
    const { revalidate } = useRevalidator();
    
    const sensors = useSensors(
      useSensor(PointerSensor),
      useSensor(TouchSensor, {
        activationConstraint: {
          delay: 250,
          tolerance: 5,
        },
      })
    );

    const { allIngredients = [], categoryOrder: initialCategoryOrder = [], ingredientOrder: initialIngredientOrder = {} } = loaderData || {};

    const ingredientsByCategory = useMemo(() => {
        return allIngredients.reduce((acc, ing) => {
            const category = ing.categoria || 'Sin Categoría';
            if (!acc[category]) acc[category] = [];
            acc[category].push({ id: ing.id, name: ing.nombre });
            return acc;
        }, {});
    }, [allIngredients]);
    
    const [categoryOrder, setCategoryOrder] = useState(() => {
        const existingCategories = Object.keys(ingredientsByCategory);
        const ordered = initialCategoryOrder.filter(cat => existingCategories.includes(cat));
        const newCategories = existingCategories.filter(cat => !initialCategoryOrder.includes(cat));
        return [...ordered, ...newCategories];
    });

    const [ingredientOrder, setIngredientOrder] = useState(() => {
        const fullOrder = { ...initialIngredientOrder };
        Object.keys(ingredientsByCategory).forEach(cat => {
            const categoryIngredients = ingredientsByCategory[cat] || [];
            const currentOrder = fullOrder[cat] || [];
            const ordered = currentOrder.filter(id => categoryIngredients.some(ing => ing.id === id));
            const newItems = categoryIngredients.filter(ing => !currentOrder.includes(ing.id)).map(ing => ing.id);
            fullOrder[cat] = [...ordered, ...newItems];
        });
        return fullOrder;
    });

    const [toast, setToast] = useState({ active: false, content: '' });
    const actionLoading = fetcher.state !== 'idle';
    
    useEffect(() => {
      if (fetcher.state === 'idle' && fetcher.data) {
        const { success, message, errors } = fetcher.data;
        if (success) {
          showToast(message);
          revalidate();
        } else if (errors) {
          showToast(errors[0].message, true);
        }
      }
    }, [fetcher.state, fetcher.data, revalidate]);
    
    if (loaderData?.error) {
      return (
        <Frame>
          <Page title="Gestionar Orden">
              <Card>
                <div style={{padding: '40px', textAlign: 'center'}}>
                  <Text variant="headingMd" as="h2">Error al cargar la página</Text>
                  <Text tone="subdued">{loaderData.error}</Text>
                </div>
              </Card>
          </Page>
        </Frame>
      );
    }

    const showToast = (content, error = false) => {
        setToast({ active: true, content, error });
    };

    const handleDragEnd = (event) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      if (categoryOrder.includes(active.id)) {
        setCategoryOrder((items) => {
          const oldIndex = items.indexOf(active.id);
          const newIndex = items.indexOf(over.id);
          return arrayMove(items, oldIndex, newIndex);
        });
      } else {
        let sourceCategory = null;
        Object.keys(ingredientOrder).forEach(cat => {
          if (ingredientOrder[cat].includes(active.id)) {
            sourceCategory = cat;
          }
        });

        if (sourceCategory) {
           setIngredientOrder(prev => {
              const oldIndex = prev[sourceCategory].indexOf(active.id);
              const newIndex = prev[sourceCategory].indexOf(over.id);
              const newOrderForCategory = arrayMove(prev[sourceCategory], oldIndex, newIndex);
              return { ...prev, [sourceCategory]: newOrderForCategory };
           });
        }
      }
    };
    
    const handleSaveChanges = () => {
        const payload = { categoryOrder, ingredientOrder };
        const submitData = new FormData();
        submitData.append('payload', JSON.stringify(payload));
        fetcher.submit(submitData, { method: 'POST' });
    };
    
    return (
        <Frame>
            <Page
                title="Gestionar Orden"
                primaryAction={{ content: 'Guardar Orden', onAction: handleSaveChanges, loading: actionLoading }}
            >
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <BlockStack gap="600">
                    <Card>
                        <BlockStack gap="400">
                            <Text variant="headingLg" as="h2">Orden de Categorías</Text>
                            <Text tone="subdued">Arrastra y suelta las categorías para definir el orden en que aparecerán en la calculadora.</Text>
                            <SortableContext items={categoryOrder} strategy={verticalListSortingStrategy}>
                              <BlockStack gap="200">
                                {categoryOrder.map((category) => (
                                  <SortableItem key={category} id={category} name={category} isGroup />
                                ))}
                              </BlockStack>
                            </SortableContext>
                        </BlockStack>
                    </Card>
                    
                    <Card>
                         <BlockStack gap="400">
                            <Text variant="headingLg" as="h2">Orden de Ingredientes</Text>
                            <Text tone="subdued">Dentro de cada categoría, arrastra y suelta los ingredientes para definir su orden.</Text>
                            <BlockStack gap="600">
                                {categoryOrder.map(category => (
                                    <BlockStack key={category} gap="300">
                                        <Text variant="headingMd" as="h3" >{category}</Text>
                                        <Box padding="400" background="bg-surface-secondary" borderRadius="200">
                                            <SortableContext items={ingredientOrder[category] || []} strategy={verticalListSortingStrategy}>
                                                <BlockStack gap="200">
                                                    {(ingredientOrder[category] || []).map((ingId) => {
                                                        const ingredient = allIngredients.find(i => i.id === ingId);
                                                        return ingredient ? <SortableItem key={ingId} id={ingId} name={ingredient.nombre} /> : null;
                                                    })}
                                                </BlockStack>
                                            </SortableContext>
                                        </Box>
                                    </BlockStack>
                                ))}
                            </BlockStack>
                        </BlockStack>
                    </Card>
                </BlockStack>
              </DndContext>
            </Page>
            {toast.active && <Toast content={toast.content} error={toast.error} onDismiss={() => setToast({active: false})} />}
        </Frame>
    );
}
