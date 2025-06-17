import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  TextField,
  Button,
  InlineStack,
  Frame,
  Toast,
  Banner,
  Link,
  InlineGrid,
  Box,
  Divider,
} from '@shopify/polaris';
import { DeleteIcon } from '@shopify/polaris-icons';
import { useState, useEffect } from 'react';
import { useFetcher, useLoaderData, useRevalidator } from '@remix-run/react';
import { authenticate } from '../shopify.server';

// Import all necessary GraphQL utilities from the single, unified file
import {
  GET_INGREDIENT_DEFINITION_QUERY,
  PARTIAL_UPDATE_DEFINITION_MUTATION,
  GET_SORT_ORDER_QUERY,
  SET_SORT_ORDER_MUTATION,
  GET_INGREDIENTS_METAOBJECTS_QUERY,
  UPDATE_INGREDIENT_METAOBJECT_MUTATION,
  GET_BOWL_MODELS_QUERY, // ADDED: To fetch bowl models
  UPDATE_BOWL_MODEL_MUTATION,   // ADDED: To update bowl models
} from '../utils/graphql.js';

// --- SERVER-SIDE LOADER ---
export async function loader({ request }) {
  const { admin } = await authenticate.admin(request);
  const response = await admin.graphql(GET_INGREDIENT_DEFINITION_QUERY);
  const responseData = await response.json();
  const definition = responseData.data.metaobjectDefinitionByType;

  const getChoices = (key) => {
    const field = definition?.fieldDefinitions.find(f => f.key === key);
    const validation = field?.validations.find(v => v.name === 'choices');
    return validation ? JSON.parse(validation.value) : [];
  };

  const categories = getChoices('categoria');
  const allergens = getChoices('alergenos');

  return Response.json({ definitionId: definition.id, categories, allergens });
}

// --- SERVER-SIDE ACTION (REFACTORED FOR FULL SYNCHRONIZATION) ---
export async function action({ request }) {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const payload = JSON.parse(formData.get('payload'));
  const { definitionId, fieldKey, newChoices } = payload;

  try {
    // --- Step 1: Update the Metaobject Definition with the new choices ---
    const definitionUpdateInput = {
      fieldDefinitions: [{ update: { key: fieldKey, validations: [{ name: "choices", value: JSON.stringify(newChoices) }] } }]
    };
    const definitionResult = await admin.graphql(PARTIAL_UPDATE_DEFINITION_MUTATION, {
      variables: { id: definitionId, definition: definitionUpdateInput },
    });
    const definitionData = await definitionResult.json();
    if (definitionData.data?.metaobjectDefinitionUpdate?.userErrors.length > 0) {
      return Response.json({ errors: definitionData.data.metaobjectDefinitionUpdate.userErrors }, { status: 422 });
    }

    // --- Step 2, 3, & 4 are only for category changes ---
    if (fieldKey === 'categoria') {

      const shopIdResponse = await admin.graphql(`query getShopId { shop { id } }`);
      const shopIdData = await shopIdResponse.json();
      const shopId = shopIdData.data.shop.id;
      
      // --- Step 2: Synchronize the Category Order Metafield ---
      const orderResponse = await admin.graphql(GET_SORT_ORDER_QUERY);
      const orderData = await orderResponse.json();
      const currentOrder = JSON.parse(orderData.data.shop.categoryOrder?.value || '[]');
      const syncedOrder = currentOrder.filter(cat => newChoices.includes(cat));
      newChoices.forEach(cat => {
        if (!syncedOrder.includes(cat)) {
          syncedOrder.push(cat);
        }
      });
      const categoryOrderMetafield = {
          ownerId: shopId,
          namespace: "custom",
          key: "category_order",
          type: "json",
          value: JSON.stringify(syncedOrder)
      };
      await admin.graphql(SET_SORT_ORDER_MUTATION, { variables: { metafields: [categoryOrderMetafield] } });

      // --- Step 3: Clean up Ingredients with deleted categories ---
      const ingredientsResponse = await admin.graphql(GET_INGREDIENTS_METAOBJECTS_QUERY);
      const ingredientsData = await ingredientsResponse.json();
      const allIngredients = ingredientsData.data.metaobjects.edges;
      const ingredientUpdatePromises = allIngredients
        .filter(({ node }) => {
            const ingredientCategory = node.categoria?.value;
            return ingredientCategory && !newChoices.includes(ingredientCategory);
        })
        .map(({ node }) => {
            const fieldsToUpdate = [{ key: "categoria", value: "" }];
            return admin.graphql(UPDATE_INGREDIENT_METAOBJECT_MUTATION, {
                variables: { id: node.id, metaobject: { fields: fieldsToUpdate } }
            });
        });
      await Promise.all(ingredientUpdatePromises);
      
      // --- Step 4: Synchronize Bowl Model Limits ---
      const bowlModelsResponse = await admin.graphql(GET_BOWL_MODELS_QUERY);
      const bowlModelsData = await bowlModelsResponse.json();
      const allBowlModels = bowlModelsData.data.metaobjects.edges;
      
      const bowlModelUpdatePromises = allBowlModels.map(({ node }) => {
        const currentLimits = JSON.parse(node.category_limits?.value || '{}');
        const syncedLimits = {};
        
        // Add new categories with a default limit of 0, and keep existing ones
        newChoices.forEach(cat => {
            syncedLimits[cat] = currentLimits[cat] || '0';
        });

        // Prepare fields for update, including all other fields on the bowl model
        const fieldsToUpdate = [
            { key: "category_limits", value: JSON.stringify(syncedLimits) }
        ];

        return admin.graphql(UPDATE_BOWL_MODEL_MUTATION, {
            variables: { id: node.id, metaobject: { fields: fieldsToUpdate } }
        });
      });
      
      await Promise.all(bowlModelUpdatePromises);
    }
    
    return Response.json({ success: true, message: 'Configuración guardada y sincronizada.' });

  } catch (error) {
    console.error("Action error:", error);
    return Response.json({ errors: [{ message: "An unexpected server error occurred." }] }, { status: 500 });
  }
}

// --- HELPER COMPONENT FOR MANAGING A LIST OF CHOICES ---
function ChoiceManagementCard({ title, items, onSave, loading }) {
  const [localItems, setLocalItems] = useState(items);
  const [newItemValue, setNewItemValue] = useState('');

  useEffect(() => {
    setLocalItems(items);
  }, [items]);

  const handleItemChange = (index, value) => {
    const newItems = [...localItems];
    newItems[index] = value;
    setLocalItems(newItems);
  };

  const handleAddItem = () => {
    if (newItemValue.trim() === '' || localItems.includes(newItemValue.trim())) return;
    setLocalItems([...localItems, newItemValue.trim()]);
    setNewItemValue('');
  };

  const handleRemoveItem = (index) => {
    const newItems = localItems.filter((_, i) => i !== index);
    setLocalItems(newItems);
  };
  
  const handleSave = () => {
    onSave(localItems);
  };

  return (
    <Card>
      <BlockStack gap="400">
        <BlockStack gap="300">
          {localItems.map((item, index) => (
            <InlineStack key={index} gap="300" blockAlign="center">
              <div style={{ flexGrow: 1 }}><TextField value={item} onChange={v => handleItemChange(index, v)} label={`Opción ${index + 1}`} labelHidden/></div>
              <Button icon={DeleteIcon} onClick={() => handleRemoveItem(index)} accessibilityLabel={`Eliminar ${item}`} variant="tertiary" />
            </InlineStack>
          ))}
        </BlockStack>
        <Divider/>
        <InlineStack gap="300" blockAlign="end">
          <div style={{ flexGrow: 1 }}><TextField label="Añadir nuevo" value={newItemValue} onChange={setNewItemValue} placeholder="Nueva opción" /></div>
          <Button onClick={handleAddItem} variant='primary'>Añadir</Button>
        </InlineStack>
        <div style={{ marginTop: '20px' }}>
          <Button onClick={handleSave} loading={loading} fullWidth variant='primary' size='large'>Guardar Cambios</Button>
        </div>
      </BlockStack>
    </Card>
  );
}


// --- MAIN REACT COMPONENT ---
export default function ConfigurationsPage() {
  const { definitionId, categories, allergens } = useLoaderData();
  const fetcher = useFetcher();
  const { revalidate } = useRevalidator();
  
  const [toast, setToast] = useState({ active: false, content: '' });
  const [showUpdateWarning, setShowUpdateWarning] = useState(false);
  
  const actionLoading = fetcher.state !== 'idle';
  
  useEffect(() => {
    if (fetcher.state === 'idle' && fetcher.data) {
      const { success, message, errors } = fetcher.data;
      if (success) {
        showToast(message);
        setShowUpdateWarning(true); 
        revalidate();
      } else if (errors) {
        showToast(errors[0].message, true);
        setShowUpdateWarning(false);
      }
    }
  }, [fetcher.state, fetcher.data, revalidate]);

  const showToast = (content, error = false) => {
    setToast({ active: true, content, error });
  };

  const handleSave = (fieldKey, newChoices) => {
    const payload = { definitionId, fieldKey, newChoices };
    const submitData = new FormData();
    submitData.append('payload', JSON.stringify(payload));
    fetcher.submit(submitData, { method: 'POST' });
  };
  
  const warningBanner = showUpdateWarning ? (
      <Layout.Section>
        <Banner
          title="Configuración actualizada y sincronizada"
          tone="success"
          onDismiss={() => setShowUpdateWarning(false)}
        >
          <p>
            Tus cambios han sido guardados. Todos los datos relacionados (orden, ingredientes y modelos de bowl) han sido actualizados. Te recomendamos revisar tus{' '}
            <Link url="/app/bowl-models">Modelos de Bowl</Link> para confirmar los límites de las nuevas categorías.
          </p>
        </Banner>
      </Layout.Section>
    ) : null;

  return (
    <Frame>
      <Page
        title="Configuración de Opciones"
        divider
      >
        <Layout>
          {warningBanner}
          <Layout.Section>
            <InlineGrid columns={{ xs: "1fr", md: "2fr 5fr" }} gap="400">
              <Box as="section" paddingInlineStart={{ xs: 400, sm: 0 }} paddingInlineEnd={{ xs: 400, sm: 0 }}>
                <BlockStack gap="400">
                  <Text as="h3" variant="headingMd">
                    Categorías de Ingredientes
                  </Text>
                  <Text as="p" variant="bodyMd" tone="subdued">
                    Gestiona la lista de categorías disponibles para tus ingredientes. Al guardar, el orden se sincronizará y los ingredientes y modelos de bowl afectados serán actualizados.
                  </Text>
                </BlockStack>
              </Box>
              <ChoiceManagementCard
                items={categories}
                onSave={(newItems) => handleSave('categoria', newItems)}
                loading={actionLoading && fetcher.formData?.get('payload')?.includes('categoria')}
              />
            </InlineGrid>
          </Layout.Section>
          
          <Layout.Section>
            <Divider />
          </Layout.Section>
          
          <Layout.Section>
            <InlineGrid columns={{ xs: "1fr", md: "2fr 5fr" }} gap="400">
              <Box as="section" paddingInlineStart={{ xs: 400, sm: 0 }} paddingInlineEnd={{ xs: 400, sm: 0 }}>
                <BlockStack gap="400">
                  <Text as="h3" variant="headingMd">
                    Alérgenos
                  </Text>
                  <Text as="p" variant="bodyMd" tone="subdued">
                    Gestiona la lista de alérgenos disponibles que se pueden asignar a cada ingrediente.
                  </Text>
                </BlockStack>
              </Box>
              <ChoiceManagementCard
                items={allergens}
                onSave={(newItems) => handleSave('alergenos', newItems)}
                loading={actionLoading && fetcher.formData?.get('payload')?.includes('alergenos')}
              />
            </InlineGrid>
          </Layout.Section>
        </Layout>
      </Page>
      {toast.active && <Toast content={toast.content} error={toast.error} onDismiss={() => setToast({ active: false })} />}
    </Frame>
  );
}
