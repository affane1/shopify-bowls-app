import {
  Page,
  Card,
  Layout,
  Text,
  BlockStack,
  Button,
  Modal,
  IndexTable,
  useIndexResourceState,
  FormLayout,
  TextField,
  Frame,
  Toast,
  ButtonGroup,
  Spinner,
  Divider,
  Banner,
} from '@shopify/polaris';
import { useState, useEffect, useCallback } from 'react';
import { useFetcher, useLoaderData } from '@remix-run/react';
import { authenticate } from '../shopify.server';

// ==========================================================================================
// --- GraphQL Queries and Mutations for Metaobjects ---
// ==========================================================================================

const GET_BOWL_MODELS_QUERY = `
  query getBowlModelMetaobjects {
    metaobjects(type: "bowl_model", first: 50) {
      edges {
        node {
          id
          handle
          name: field(key: "name") { value }
          description: field(key: "description") { value }
          base_price: field(key: "base_price") { value }
          category_limits: field(key: "category_limits") { value }
        }
      }
    }
  }
`;

// FIX: This query now correctly fetches all field definitions without filtering by key.
const GET_INGREDIENT_CATEGORIES_QUERY = `
  query getIngredientDefinitionChoices {
    metaobjectDefinitionByType(type: "metaingredientes") {
      id
      fieldDefinitions {
        key
        validations {
          name
          value
        }
      }
    }
  }
`;

const CREATE_METAOBJECT_MUTATION = `
  mutation metaobjectCreate($metaobject: MetaobjectCreateInput!) {
    metaobjectCreate(metaobject: $metaobject) {
      metaobject {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const UPDATE_METAOBJECT_MUTATION = `
  mutation metaobjectUpdate($id: ID!, $metaobject: MetaobjectUpdateInput!) {
    metaobjectUpdate(id: $id, metaobject: $metaobject) {
      metaobject {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const DELETE_METAOBJECT_MUTATION = `
  mutation metaobjectDelete($id: ID!) {
    metaobjectDelete(id: $id) {
      deletedId
      userErrors {
        field
        message
      }
    }
  }
`;

// ==========================================================================================
// --- Remix Loader: Fetches initial data on the server ---
// ==========================================================================================
export async function loader({ request }) {
  const { admin } = await authenticate.admin(request);

  const [modelsResponse, categoriesResponse] = await Promise.all([
    admin.graphql(GET_BOWL_MODELS_QUERY),
    admin.graphql(GET_INGREDIENT_CATEGORIES_QUERY),
  ]);

  const modelsData = await modelsResponse.json();
  const categoriesData = await categoriesResponse.json();

  const bowlModels = modelsData.data.metaobjects.edges.map(({ node }) => {
    return {
        id: node.id,
        name: node.name?.value,
        description: node.description?.value,
        basePrice: JSON.parse(node.base_price?.value || '{}').amount,
        limits: JSON.parse(node.category_limits?.value || '{}'),
    };
  });

  let ingredientCategories = [];
  try {
    // FIX: Correctly parse the full fieldDefinitions array.
    const fieldDefinitions = categoriesData.data.metaobjectDefinitionByType?.fieldDefinitions;
    const categoryField = fieldDefinitions?.find(def => def.key === 'categoria');
    const choicesValidation = categoryField?.validations?.find(v => v.name === 'choices');
    if (choicesValidation?.value) {
      ingredientCategories = JSON.parse(choicesValidation.value);
    }
  } catch (e) {
    console.error("Could not parse ingredient categories from metaobject definition:", e);
  }

  return Response.json({ bowlModels, ingredientCategories });
}

// ==========================================================================================
// --- Remix Action: Handles form submissions on the server ---
// ==========================================================================================
export async function action({ request }) {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const payload = JSON.parse(formData.get('payload'));

  const { actionType, data } = payload;
  const METAOBJECT_DEFINITION_TYPE = 'bowl_model';

  const buildFields = (d) => {
    return [
      { key: "name", value: d.name },
      { key: "description", value: d.description },
      { key: "base_price", value: JSON.stringify({ amount: parseFloat(d.basePrice) || 0, currency_code: "EUR" }) },
      { key: "category_limits", value: JSON.stringify(d.limits) }
    ];
  };

  try {
    switch (actionType) {
      case 'CREATE': {
        const handle = data.name.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]+/g, '');
        const metaobject = {
          type: METAOBJECT_DEFINITION_TYPE,
          fields: buildFields(data),
          handle: `${handle}-${Date.now()}`
        };
        const response = await admin.graphql(CREATE_METAOBJECT_MUTATION, { variables: { metaobject } });
        const responseData = await response.json();
        if (responseData.data?.metaobjectCreate?.userErrors.length > 0) {
            return Response.json({ errors: responseData.data.metaobjectCreate.userErrors }, { status: 422 });
        }
        return Response.json({ success: true, message: 'Modelo de bowl creado.' });
      }
      case 'UPDATE': {
        const metaobject = { fields: buildFields(data) };
        const response = await admin.graphql(UPDATE_METAOBJECT_MUTATION, { variables: { id: data.id, metaobject } });
        const responseData = await response.json();
        if (responseData.data?.metaobjectUpdate?.userErrors.length > 0) {
            return Response.json({ errors: responseData.data.metaobjectUpdate.userErrors }, { status: 422 });
        }
        return Response.json({ success: true, message: 'Modelo de bowl actualizado.' });
      }
      case 'DELETE': {
        const response = await admin.graphql(DELETE_METAOBJECT_MUTATION, { variables: { id: data.id } });
        const responseData = await response.json();
        if (responseData.data?.metaobjectDelete?.userErrors.length > 0) {
            return Response.json({ errors: responseData.data.metaobjectDelete.userErrors }, { status: 422 });
        }
        return Response.json({ success: true, message: 'Modelo de bowl eliminado.' });
      }
      default:
        return Response.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch(error) {
      console.error("Action error:", error);
      return Response.json({ errors: [{ message: "An unexpected server error occurred." }] }, { status: 500 });
  }
}

// ==========================================================================================
// --- React Component ---
// ==========================================================================================
export default function BowlModelsAdminPage() {
  const { bowlModels: initialModels, ingredientCategories } = useLoaderData();
  const fetcher = useFetcher();
  
  const [bowlModels, setBowlModels] = useState(initialModels);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState(null);
  const [toast, setToast] = useState({ active: false, content: '' });

  const [activeCategories, setActiveCategories] = useState([]);
  const [orphanedCategories, setOrphanedCategories] = useState([]);

  const actionLoading = fetcher.state !== 'idle';

  useEffect(() => {
    if (fetcher.data?.bowlModels) {
        setBowlModels(fetcher.data.bowlModels);
    } else if (fetcher.state === 'idle' && !fetcher.data) {
        setBowlModels(initialModels);
    }
  }, [initialModels, fetcher.data, fetcher.state]);

  useEffect(() => {
    if (fetcher.state === 'idle' && fetcher.data) {
      const { success, message, errors } = fetcher.data;
      if (success) {
        showToast(message);
        setIsModalOpen(false);
      } else if (errors) {
        showToast(errors[0].message, true);
      }
    }
  }, [fetcher.state, fetcher.data]);
  
  const showToast = (content, error = false) => {
    setToast({ active: true, content, error });
  };
  
  const createNewModel = () => {
    const limits = {};
    ingredientCategories.forEach(cat => limits[cat] = '0');
    setFormData({ name: '', description: '', basePrice: '', limits });
    setActiveCategories(ingredientCategories);
    setOrphanedCategories([]);
    setIsEditing(false);
    setIsModalOpen(true);
  };

  const editModel = (model) => {
    const modelLimits = model.limits || {};
    const active = [];
    const orphaned = [];

    Object.keys(modelLimits).forEach(cat => {
      if (ingredientCategories.includes(cat)) {
        active.push(cat);
      } else {
        orphaned.push(cat);
      }
    });
    ingredientCategories.forEach(cat => {
        if (!active.includes(cat)) {
            active.push(cat);
        }
    });

    setActiveCategories(active);
    setOrphanedCategories(orphaned);
    
    const syncedLimits = { ...modelLimits };
    active.forEach(cat => {
        if (!syncedLimits.hasOwnProperty(cat)) {
            syncedLimits[cat] = '0';
        }
    });

    setFormData({ ...model, limits: syncedLimits });
    setIsEditing(true);
    setIsModalOpen(true);
  };
  
  const deleteModel = (id) => {
    const payload = { actionType: 'DELETE', data: { id }};
    const submitData = new FormData();
    submitData.append('payload', JSON.stringify(payload));
    fetcher.submit(submitData, { method: 'POST' });
  };

  const handleFormChange = useCallback((field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  }, []);

  const handleLimitChange = useCallback((category, value) => {
    setFormData(prev => ({
      ...prev,
      limits: { ...prev.limits, [category]: value }
    }));
  }, []);

  const handleSubmit = () => {
    const activeLimitsOnly = {};
    activeCategories.forEach(cat => {
        activeLimitsOnly[cat] = formData.limits[cat] || '0';
    });
    
    const payload = {
        actionType: isEditing ? 'UPDATE' : 'CREATE',
        data: { ...formData, limits: activeLimitsOnly }
    };
    const submitData = new FormData();
    submitData.append('payload', JSON.stringify(payload));
    fetcher.submit(submitData, { method: 'POST' });
  };
  
  const { selectedResources } = useIndexResourceState(bowlModels);
  const resourceName = { singular: 'modelo de bowl', plural: 'modelos de bowl' };

  return (
    <Frame>
      <Page
        title="Modelos de Bowl"
        primaryAction={{ content: 'Crear Modelo de Bowl', onAction: createNewModel }}
      >
        <Layout>
          <Layout.Section>
            <Card>
              <IndexTable
                resourceName={resourceName}
                itemCount={bowlModels.length}
                selectedItemsCount={selectedResources.length}
                onSelectionChange={() => {}}
                headings={[
                  { title: 'Nombre' },
                  { title: 'Descripción' },
                  { title: 'Precio Base' },
                  { title: 'Acciones' },
                ]}
              >
                {bowlModels.map((model, index) => (
                  <IndexTable.Row id={model.id} key={model.id} selected={selectedResources.includes(model.id)} position={index}>
                    <IndexTable.Cell><Text variant="bodyMd" fontWeight="bold">{model.name}</Text></IndexTable.Cell>
                    <IndexTable.Cell>{model.description}</IndexTable.Cell>
                    <IndexTable.Cell>€{parseFloat(model.basePrice || 0).toFixed(2)}</IndexTable.Cell>
                    <IndexTable.Cell>
                        <ButtonGroup>
                            <Button size="slim" onClick={() => editModel(model)}>Editar</Button>
                            <Button size="slim" destructive onClick={() => deleteModel(model.id)}>Eliminar</Button>
                        </ButtonGroup>
                    </IndexTable.Cell>
                  </IndexTable.Row>
                ))}
              </IndexTable>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
      
      {isModalOpen && (
        <Modal
            open={isModalOpen}
            onClose={() => setIsModalOpen(false)}
            title={isEditing ? 'Editar Modelo de Bowl' : 'Crear Nuevo Modelo'}
            primaryAction={{ content: 'Guardar', onAction: handleSubmit, loading: actionLoading }}
            secondaryActions={[{ content: 'Cancelar', onAction: () => setIsModalOpen(false) }]}
        >
            <Modal.Section>
                {actionLoading && <Spinner />}
                {!actionLoading && formData && (
                  <FormLayout>
                    <TextField label="Nombre del Modelo" value={formData.name} onChange={(val) => handleFormChange('name', val)} requiredIndicator />
                    <TextField label="Descripción" value={formData.description} onChange={(val) => handleFormChange('description', val)} helpText="Ej: Incluye 1 Base, 1 Proteína, etc."/>
                    <TextField label="Precio Base (€)" type="number" value={formData.basePrice} onChange={(val) => handleFormChange('basePrice', val)} requiredIndicator />
                    
                    <BlockStack gap="400">
                        <Text variant="headingMd" as="h3">Límites de Categorías Activas</Text>
                        <Text tone="subdued">Define cuántos ingredientes de cada categoría están incluidos en el precio base.</Text>
                        <FormLayout.Group>
                            {activeCategories.map(category => (
                                <TextField
                                    key={category}
                                    label={`Límite: ${category}`}
                                    type="number"
                                    value={formData.limits[category] || '0'}
                                    onChange={(val) => handleLimitChange(category, val)}
                                />
                            ))}
                        </FormLayout.Group>
                    </BlockStack>
                    
                    {orphanedCategories.length > 0 && (
                        <BlockStack gap="400" style={{marginTop: '20px'}}>
                            <Divider />
                            <Banner title="Categorías obsoletas" tone="warning">
                                <p>Las siguientes categorías ya no existen. Sus límites guardados serán eliminados al guardar los cambios.</p>
                            </Banner>
                            <FormLayout.Group>
                                {orphanedCategories.map(category => (
                                    <TextField
                                        key={category}
                                        label={`Límite (obsoleto): ${category}`}
                                        type="number"
                                        value={formData.limits[category] || '0'}
                                        disabled
                                    />
                                ))}
                            </FormLayout.Group>
                        </BlockStack>
                    )}
                  </FormLayout>
                )}
            </Modal.Section>
        </Modal>
      )}

      {toast.active && <Toast content={toast.content} error={toast.error} onDismiss={() => setToast({active: false})} />}
    </Frame>
  );
}
